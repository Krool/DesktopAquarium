// Prevents additional console window on Windows in release and debug builds
#![windows_subsystem = "windows"]

fn main() {
    ascii_reef_lib::run()
}
