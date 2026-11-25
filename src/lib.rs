mod game;
mod model;

pub use game::Engine;
pub use model::*;

#[cfg(target_arch = "wasm32")]
mod browser {
    use super::*;
    use serde_json::json;
    use std::cell::RefCell;

    #[derive(Default)]
    struct Bridge {
        input: Vec<u8>,
        output: Vec<u8>,
        engine: Engine,
    }

    thread_local! {
        static BRIDGE: RefCell<Bridge> = RefCell::new(Bridge::default());
    }

    #[no_mangle]
    pub extern "C" fn input_buffer(length: usize) -> *mut u8 {
        BRIDGE.with(|bridge| {
            let mut bridge = bridge.borrow_mut();
            bridge.input.resize(length, 0);
            bridge.input.as_mut_ptr()
        })
    }

    #[no_mangle]
    pub extern "C" fn dispatch() -> *const u8 {
        BRIDGE.with(|bridge| {
            let mut bridge = bridge.borrow_mut();
            let response = match serde_json::from_slice(&bridge.input) {
                Ok(command) => bridge.engine.dispatch(command),
                Err(error) => json!({"error": error.to_string()}),
            };
            bridge.output = serde_json::to_vec(&response).expect("response serializes");
            bridge.output.as_ptr()
        })
    }

    #[no_mangle]
    pub extern "C" fn output_length() -> usize {
        BRIDGE.with(|bridge| bridge.borrow().output.len())
    }
}
