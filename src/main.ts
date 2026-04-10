import {CompanionOptionValues, InstanceBase, InstanceStatus, runEntrypoint, SomeCompanionConfigField} from '@companion-module/base'
import {GetConfigFields, type ModuleConfig} from './config.js'
import {UpdateVariableDefinitions} from './variables.js'
import {UpgradeScripts} from './upgrades.js'
import {handleSetProviderMessage, BitFireProviderMessage} from './actions.js'
import {UpdateFeedbacks} from './feedbacks.js'
import {UpdatePresets} from './presets.js'
import WebSocket from 'ws'
import {CompanionActionDefinitions} from "@companion-module/base/dist/index.js";

export class BitFireInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig
	private allProviderActions: Record<string, CompanionActionDefinitions> = {}

	private socket: WebSocket | undefined
	private connected: boolean = false

	private reconnectTimer: NodeJS.Timeout | null = null

	constructor(internal: unknown) {
		super(internal)
	}

	/**
	 * Attempt to connect to a WebSocket.
	 *
	 * @param connectionString
	 */
	initConnection(connectionString: string) {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
		}

		if (this.socket) {
			this.socket.close(1000)
			delete this.socket
		}

		if (connectionString) {
			this.updateStatus(InstanceStatus.Connecting)

			try {
				if (!connectionString.startsWith('wss://') && !connectionString.startsWith('ws://')) {
					this.updateStatus(InstanceStatus.BadConfig, "Connection string should include websocket url (wss://)")
					return
				}

				if (connectionString.startsWith('ws://') && !this.config.allowUnsecureConnection) {
					this.updateStatus(InstanceStatus.BadConfig, "Connection string is for UNSECURE websocket but unsecure connections are not enabled.")
					return
				}

				this.socket = new WebSocket(connectionString)

				this.socket.on('open', () => {
					this.connected = true
					this.updateStatus(InstanceStatus.Ok)
					this.socket?.send(JSON.stringify({"action": "list_provider"}))
				})

				this.socket.on('close', (code, reason) => {
					this.connected = false
					this.log('debug', `WebSocket connection closed with code ${code}: ${reason}`)
					this.updateStatus(InstanceStatus.Disconnected)
					// Attempt to reconnect only when it wasn't a normal closure (1000).
					if (code !== 1000) {
						this.scheduleReconnect()
					}
				})

				this.socket.on('error', (err) => {
					if (this.connected) {
						this.connected = false
						this.log('error', `WebSocket connection error: ${err}`)
						this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
					}

					if (this.socket) {
						this.socket.close()
					}
				})

				this.socket.on('message', this.parseMessage.bind(this))

			} catch (e) {
				this.updateStatus(InstanceStatus.UnknownError, "Could not create WebSocket connection")
			}

		} else {
			this.updateStatus(InstanceStatus.BadConfig, "Missing connection string")
		}
	}

	/**
	 * Attempt to reconnect to the Websocket.
	 * This function is safe to be called multiple times. Each subsequent call will clear the last's timer.
	 * @private
	 */
	private scheduleReconnect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
		}

		this.reconnectTimer = setTimeout(() => {
			this.log('info', `Attempting to reconnect to websocket...`)
			this.initConnection(this.config.connectionString)
		}, 5000)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		// Actions are updated when successful connection is made to the Macro Engine.
		this.updateFeedbacks() // export feedbacks
		this.updatePresets() // export Presets
		this.updateVariableDefinitions() // export variable definitions

		this.initConnection(this.config.connectionString)
	}

	async destroy(): Promise<void> {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
		}

		if (this.socket) {
			this.socket.close(1000)
		}
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.initConnection(this.config.connectionString)
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateProviders(provider: BitFireProviderMessage, actions: CompanionActionDefinitions): void {
		this.allProviderActions[provider.name] = actions
	}

	getProviders(): Record<string, CompanionActionDefinitions> {
		return this.allProviderActions
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	parseMessage(data: string) {
		try {
			let message = JSON.parse(data)
			this.log('debug', `received ${JSON.stringify(message)}`)
			switch (message.action) {
				case 'set_provider': handleSetProviderMessage(this, message.value); break;
			}

		} catch {
			this.log('error', `unable to parse: ${data}`)
		}
	}

	/**
	 * Send a command to the correct provider via the Macro Engine's `send` command.
	 * @param provider - Provider defined in the Macro Engine
	 * @param commandName - command "name". Not what the API expects the literal command to be. (i.e. "Hot Take", "Dissolve", etc.)
	 * @param args - arguments to be passed to the command based on what the user entered in Companion
	 */
	sendMessage(provider: string, commandName: string, args: CompanionOptionValues): void {
		if (this.socket && this.connected) {
			try {
				this.log('debug', `Sending: "action": "execute_step", "provider": ${provider}, "command": send, "arguments": ${JSON.stringify(args)}`)

				const providerActions = this.allProviderActions[provider]
				const actionDef = providerActions ? providerActions[commandName] : undefined
				const cleanArgs: Record<string, any> = {...args};
				if (actionDef && actionDef.options) {
					for (const option of actionDef.options) {
						const value = args[option.id];
						const isMissing = (value === undefined || value === null || value === "");
						const isRequired = 'required' in option && option.required;

						// Companion `required` only provides text highlighting. Action can still be triggered
						// without `required` options. We don't want to send if all required fields aren't filled out.
						// Unfortunately, user won't know something is wrong unless they have logging tab open.
						if (isMissing && isRequired) {
							this.log('error', `ABORTED: Action "${commandName}" requires "${option.id}" but it is empty.`);
							return
						}
					}
				}

				this.socket.send(JSON.stringify({"action": "execute_step", "provider": provider, "command": commandName, "arguments": cleanArgs}))

			} catch (err) {
				let errorMessage = 'Unknown error';
				if (err instanceof Error) {
					errorMessage = err.message
				}
				this.log('error', `Send failure: ${errorMessage}`)
			}
		}
	}
}

runEntrypoint(BitFireInstance, UpgradeScripts)