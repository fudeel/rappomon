param([ValidateRange(1, 65535)][int]$Port = 5173)

$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    rustup target add wasm32-unknown-unknown
    if ($LASTEXITCODE -ne 0) { throw 'The Rust WebAssembly target could not be installed.' }
    cargo build --release --lib --target wasm32-unknown-unknown
    if ($LASTEXITCODE -ne 0) { throw 'The WebAssembly game build failed.' }
    Copy-Item -LiteralPath 'target/wasm32-unknown-unknown/release/freestylomon.wasm' -Destination 'web/freestylomon.wasm' -Force
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -in '127.0.0.1', '0.0.0.0' } |
        Select-Object -First 1
    if ($listener) {
        $running = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        $serverPaths = @(
            Join-Path $PWD 'target/release/freestylomon-local.exe'
            Join-Path $PWD 'target/release/freestylomon.exe'
        )
        if ($running.Path -in $serverPaths) {
            Write-Host "Freestylomon is already running at http://127.0.0.1:$Port/"
            Write-Host "Backstage at http://127.0.0.1:$Port/backstage/ (admin / admin)"
            return
        }
        throw "Port $Port is already in use. Run this script with -Port 5174 or another free port."
    }
    cargo run --release -- $Port
    if ($LASTEXITCODE -ne 0) { throw 'The local Freestylomon server stopped with an error.' }
} finally {
    Pop-Location
}
