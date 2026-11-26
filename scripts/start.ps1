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
        if ($running.Path -notin $serverPaths) {
            throw "Port $Port is already in use. Run this script with -Port 5174 or another free port."
        }
        # Restart the old server so it serves the latest build and routes.
        Write-Host 'Restarting the running Freestylomon server with the latest build...'
        Stop-Process -Id $running.Id -Force
        $running.WaitForExit(5000) | Out-Null
        $deadline = (Get-Date).AddSeconds(5)
        while ((Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 200
        }
    }
    cargo run --release -- $Port
    if ($LASTEXITCODE -ne 0) { throw 'The local Freestylomon server stopped with an error.' }
} finally {
    Pop-Location
}
