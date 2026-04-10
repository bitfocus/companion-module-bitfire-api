## BitFire API
This Companion module connects to a `MacroEngine` element present on a BitFire Spark™ Environment.
There are no predefined `Actions` in this module; the `Actions` available are determined by what the `MacroEngine` is 
connected to. Upon successfully connecting, this module should populate `Actions`.

### Requirements

- Spark™ Environment
- `MacroEngine` element on target Spark™ Environment

### Configuration
There will be a connection string generated with your Spark™ Environment. It should take the form of a Websocket
connection url. Do not remove the `wss://` prefix. This module expects the whole url to be passed.