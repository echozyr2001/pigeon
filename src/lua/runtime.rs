use anyhow::{Context, Ok, Result};
use mlua::{Lua, LuaOptions, StdLib};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use super::{config, plugin};

/// Lua runtime wrapper that manages the shared Lua state and provides safe execution.
pub struct LuaRuntime {
    lua: Arc<Mutex<Lua>>,
    config_path: PathBuf,
}

impl LuaRuntime {
    /// Create a new Lua runtime with restricted standard library access
    pub fn new(config_dir: &Path) -> Result<Self> {
        // Create Lua state with limited standard library
        // Exclude DEBUG module (unsafe) and IO/OS (security)
        let stdlib = StdLib::COROUTINE
            | StdLib::TABLE
            | StdLib::STRING
            | StdLib::UTF8
            | StdLib::MATH
            | StdLib::PACKAGE;
        let lua = Lua::new_with(stdlib, LuaOptions::default())?;

        let runtime = Self {
            lua: Arc::new(Mutex::new(lua)),
            config_path: config_dir.to_path_buf(),
        };

        runtime.setup()?;

        Ok(runtime)
    }

    /// Execute a Lua script from a file
    pub fn load_file(&self, path: &Path) -> Result<()> {
        let lua = self.lua.lock().unwrap();
        let script = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read lua script: {}", path.display()))?;

        lua.load(&script)
            .set_name(path.display().to_string())
            .exec()
            .with_context(|| format!("Failed to execute Lua script: {}", path.display()))?;

        Ok(())
    }

    /// Get the config directory path
    pub fn config_dir(&self) -> &Path {
        &self.config_path
    }
}

impl LuaRuntime {
    /// Setup the Lua runtime
    fn setup(&self) -> Result<()> {
        let lua = self.lua.lock().unwrap();
        let globals = lua.globals();

        let config_table = lua.create_table()?;

        config::setup(&lua, &config_table)?;
        plugin::setup(&lua, &config_table)?;

        globals.set("pigeon", config_table)?;

        Ok(())
    }
}
