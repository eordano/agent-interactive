use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::process::exit;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

const USAGE: &str = "usage: agent-pty [--cols N] [--rows N] -- COMMAND [ARG...]

Runs COMMAND in a pseudo-terminal of the given size (default 120x36).
Everything the terminal prints is copied to stdout. Stdin carries frames,
each one byte of kind, a big-endian u32 length and that many bytes:
  i  bytes typed into the terminal
  r  a resize: cols then rows, each a big-endian u16
Closing stdin ends the command. Exits with the command's exit code.";

fn fail(msg: &str) -> ! {
    eprintln!("agent-pty: {msg}");
    exit(2)
}

fn main() {
    let mut args = std::env::args().skip(1);
    let (mut cols, mut rows) = (120u16, 36u16);
    let mut cmd: Vec<String> = Vec::new();
    while let Some(a) = args.next() {
        match a.as_str() {
            "--cols" => cols = args.next().and_then(|v| v.parse().ok()).unwrap_or_else(|| fail("--cols needs a number")),
            "--rows" => rows = args.next().and_then(|v| v.parse().ok()).unwrap_or_else(|| fail("--rows needs a number")),
            "-h" | "--help" => {
                println!("{USAGE}");
                exit(0)
            }
            "--" => {
                cmd = args.by_ref().collect();
                break;
            }
            other => fail(&format!("unknown argument {other}\n{USAGE}")),
        }
    }
    if cmd.is_empty() {
        fail(&format!("no command given\n{USAGE}"));
    }

    let pair = native_pty_system()
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .unwrap_or_else(|e| fail(&format!("could not open a pseudo-terminal: {e}")));
    let mut builder = CommandBuilder::new(&cmd[0]);
    builder.args(&cmd[1..]);
    if let Ok(cwd) = std::env::current_dir() {
        builder.cwd(cwd);
    }
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    let mut child = pair
        .slave
        .spawn_command(builder)
        .unwrap_or_else(|e| fail(&format!("could not start {}: {e}", cmd[0])));
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().unwrap_or_else(|e| fail(&e.to_string()));
    let mut writer = pair.master.take_writer().unwrap_or_else(|e| fail(&e.to_string()));
    let master = pair.master;
    let mut killer = child.clone_killer();

    let (drained, output_done) = mpsc::channel();
    thread::spawn(move || {
        let mut out = std::io::stdout().lock();
        let mut buf = [0u8; 16384];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if out.write_all(&buf[..n]).and_then(|_| out.flush()).is_err() {
                        break;
                    }
                }
            }
        }
        let _ = drained.send(());
    });

    thread::spawn(move || {
        let mut input = std::io::stdin().lock();
        let mut head = [0u8; 5];
        while input.read_exact(&mut head).is_ok() {
            let len = u32::from_be_bytes([head[1], head[2], head[3], head[4]]) as usize;
            let mut body = vec![0u8; len];
            if input.read_exact(&mut body).is_err() {
                break;
            }
            match head[0] {
                b'i' => {
                    let _ = writer.write_all(&body).and_then(|_| writer.flush());
                }
                b'r' if len == 4 => {
                    let cols = u16::from_be_bytes([body[0], body[1]]);
                    let rows = u16::from_be_bytes([body[2], body[3]]);
                    if cols > 0 && rows > 0 {
                        let _ = master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
                    }
                }
                _ => {}
            }
        }
        let _ = killer.kill();
    });

    let status = child.wait().unwrap_or_else(|e| fail(&format!("waiting for {}: {e}", cmd[0])));
    let _ = output_done.recv_timeout(Duration::from_millis(500));
    exit(status.exit_code() as i32)
}
