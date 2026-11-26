use std::io::{self, BufRead, BufReader, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::path::Path;
use std::time::Duration;

fn main() -> io::Result<()> {
    let port = std::env::args()
        .nth(1)
        .map(|value| value.parse::<u16>())
        .transpose()
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?
        .unwrap_or(5173);
    if !Path::new("web/freestylomon.wasm").exists() {
        eprintln!("Build the web game first with scripts/start.ps1, then launch from the project directory.");
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "web/freestylomon.wasm",
        ));
    }
    let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port))?;
    let address = listener.local_addr()?;
    println!("Freestylomon  http://{address}/");
    println!("Backstage     http://{address}/backstage/  (admin / admin)");
    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                std::thread::spawn(move || {
                    let _ = serve(stream);
                });
            }
            Err(error) => eprintln!("Connection error: {error}"),
        }
    }
    Ok(())
}

fn serve(mut stream: TcpStream) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(4)))?;
    stream.set_write_timeout(Some(Duration::from_secs(4)))?;
    let mut reader = BufReader::new(&mut stream);
    let mut request = String::new();
    if reader.read_line(&mut request)? == 0 {
        return Ok(());
    }
    let mut auth = false;
    let mut total = request.len();
    loop {
        let mut header = String::new();
        let length = reader.read_line(&mut header)?;
        if length == 0 || header == "\r\n" || header == "\n" {
            break;
        }
        total += length;
        if total > 16_384 {
            return response(
                &mut stream,
                "431 Request Header Fields Too Large",
                "text/plain",
                "",
                b"Headers too large",
                false,
            );
        }
        if let Some((name, value)) = header.trim().split_once(':') {
            if name.eq_ignore_ascii_case("Authorization") {
                auth = value.trim() == "Basic YWRtaW46YWRtaW4=";
            }
        }
    }
    let mut request = request.split_whitespace();
    let method = request.next().unwrap_or_default();
    let path = request
        .next()
        .unwrap_or_default()
        .split('?')
        .next()
        .unwrap_or_default();
    let head = method == "HEAD";
    if method != "GET" && !head {
        return response(
            &mut stream,
            "405 Method Not Allowed",
            "text/plain",
            "Allow: GET, HEAD\r\n",
            b"Method not allowed",
            false,
        );
    }
    if let Some(name) = path.strip_prefix("/music/") {
        return serve_music(&mut stream, name, head);
    }
    let (file, mime, extra) = match path {
        "/backstage" | "/backstage/" | "/backstage.html" if !auth => {
            return response(
                &mut stream,
                "401 Unauthorized",
                "text/plain; charset=utf-8",
                "WWW-Authenticate: Basic realm=\"Freestylomon Backstage\"\r\n",
                b"Backstage requires a username and password.",
                head,
            )
        }
        "/backstage" => {
            return response(
                &mut stream,
                "308 Permanent Redirect",
                "text/plain",
                "Location: /backstage/\r\n",
                b"",
                head,
            )
        }
        "/backstage/" | "/backstage.html" => ("backstage.html", "text/html; charset=utf-8", ""),
        "/" | "/index.html" => ("index.html", "text/html; charset=utf-8", ""),
        "/style.css" => ("style.css", "text/css; charset=utf-8", ""),
        "/app.js" => ("app.js", "text/javascript; charset=utf-8", ""),
        "/art.js" => ("art.js", "text/javascript; charset=utf-8", ""),
        "/engine.js" => ("engine.js", "text/javascript; charset=utf-8", ""),
        "/rhythm.js" => ("rhythm.js", "text/javascript; charset=utf-8", ""),
        "/backstage/admin.js" if auth => ("admin.js", "text/javascript; charset=utf-8", ""),
        "/backstage/admin.js" => {
            return response(
                &mut stream,
                "401 Unauthorized",
                "text/plain",
                "WWW-Authenticate: Basic realm=\"Freestylomon Backstage\"\r\n",
                b"Backstage requires sign-in.",
                head,
            )
        }
        "/freestylomon.wasm" => ("freestylomon.wasm", "application/wasm", ""),
        "/offline.js" => (
            "offline.js",
            "text/javascript; charset=utf-8",
            "Service-Worker-Allowed: /\r\n",
        ),
        "/favicon.ico" => {
            return response(&mut stream, "204 No Content", "text/plain", "", b"", head)
        }
        _ => {
            return response(
                &mut stream,
                "404 Not Found",
                "text/plain",
                "",
                b"Not found",
                head,
            )
        }
    };
    match std::fs::read(Path::new("web").join(file)) {
        Ok(body) => response(&mut stream, "200 OK", mime, extra, &body, head),
        Err(_) => response(
            &mut stream,
            "404 Not Found",
            "text/plain",
            "",
            b"File not found",
            head,
        ),
    }
}

/// Serves an audio file from the project's `music` folder for the minigames.
fn serve_music(stream: &mut TcpStream, encoded: &str, head: bool) -> io::Result<()> {
    let name = percent_decode(encoded);
    let mime = match name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp3") => "audio/mpeg",
        Some("ogg" | "oga") => "audio/ogg",
        Some("wav") => "audio/wav",
        Some("m4a" | "mp4" | "aac") => "audio/mp4",
        Some("flac") => "audio/flac",
        Some("webm") => "audio/webm",
        _ => "",
    };
    let safe = !name.is_empty()
        && name.len() <= 120
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ' '));
    if !safe || mime.is_empty() {
        return response(stream, "404 Not Found", "text/plain", "", b"Not found", head);
    }
    match std::fs::read(Path::new("music").join(&name)) {
        Ok(body) => response(stream, "200 OK", mime, "", &body, head),
        Err(_) => response(
            stream,
            "404 Not Found",
            "text/plain",
            "",
            b"Track not found in the music folder",
            head,
        ),
    }
}

fn percent_decode(value: &str) -> String {
    let hex = |byte: u8| (byte as char).to_digit(16);
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push((high * 16 + low) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn response(
    stream: &mut TcpStream,
    status: &str,
    mime: &str,
    extra: &str,
    body: &[u8],
    head: bool,
) -> io::Result<()> {
    write!(stream, "HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n{extra}\r\n", body.len())?;
    if !head {
        stream.write_all(body)?;
    }
    stream.flush()
}
