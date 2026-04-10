import { type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	connectionString: string
	allowUnsecureConnection: boolean
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'connectionString',
			label: 'Spark™ Environment Connection String',
			tooltip: 'Connection string as a websocket (wss://)',
			width: 50
		},
		{
			type: "checkbox",
			default: false,
			id: 'allowUnsecureConnection',
			label: 'Allow unsecure connection',
			tooltip: "NOT RECOMMENDED: Your connection string will be unencrypted. Only enable this for local " +
				 	 "testing or trusted private networks.",
			width: 1
		},
	]
}