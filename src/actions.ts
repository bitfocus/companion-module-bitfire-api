import type { BitFireInstance } from './main.js'
import {
	CompanionActionDefinitions,
	CompanionInputFieldDropdown,
	CompanionInputFieldTextInput
} from "@companion-module/base/dist/index.js";

export interface BitfireArgumentChoice {
	[key: string]: string
}

export interface BitFireCommandArg {
	description: string
	required: boolean,
	default?: string,
	// For right now, number is same as string.
	type: "string" | "number" | "dropdown",
	// Empty object when there are no choices defined.
	choices: BitfireArgumentChoice[] | Record<string, never>
}

export interface BitFireCommandArgs {
	[argName: string]: BitFireCommandArg
}

export interface BitFireCommand {
	description: string
	args: BitFireCommandArgs
}

export interface BitFireProviderMessage {
	/// Provider name
	name: string
	uri: string
	commands: { [commandName: string]: BitFireCommand}
}

export function validateProviderMessage(msg: unknown): msg is BitFireProviderMessage {
	if (typeof msg !== 'object' || msg === null) return false;

	const obj = msg as Record<string, any>;

	if (typeof obj.name !== 'string') return false;
	if (typeof obj.uri !== 'string') return false;
	if (typeof obj.commands !== 'object' || obj.commands === null) return false;
	const commands = Object.values(obj.commands);
	return commands.every(validateBitFireCommand);
}

function validateChoices(choices: any): boolean {
	if(typeof choices !== 'object' || choices === null) return false;

	if(Array.isArray(choices)) {
		return choices.every(choice =>
			typeof choice === "object" &&
			choice !== null &&
			!Array.isArray(choice)
		);
	}

	// empty object {}, otherwise any non-null object would pass
	return Object.keys(choices).length === 0;
}

function validateBitFireCommand(cmd: any): boolean {
	if (typeof cmd !== 'object' || cmd === null) return false;
	if (typeof cmd.description !== 'string') return false;
	if (typeof cmd.args !== 'object' || cmd.args === null) return false;

	const validTypes = ["string", "number", "dropdown"];

	return Object.values(cmd.args).every((arg: any) => {
		return (
			typeof arg === 'object' && arg !== null &&
			typeof arg.description === 'string' &&
			typeof arg.required === 'boolean' &&
			validTypes.includes(arg.type) &&
			validateChoices(arg.choices)
		);
	});
}

/**
 * Given a 'set_provider' message from a Macro Engine, attempt to convert it to the `BitFireProviderMessage` interface,
 * and then create `CompanionActionDefinition` objects to update the actions of `self`.
 * @param module - `BitFireInstance` module
 * @param msg - 'set_providers' Macro Engine API response
 */
export function handleSetProviderMessage(module: BitFireInstance, msg: unknown): void {
	if(!validateProviderMessage(msg)){
		module.log('error', `Received invalid provider message.`)
		return;
	}

	let bf_provider = msg
	let actions = makeActionsFromProviderMessage(bf_provider, module)

	// the module keeps track of all possible actions by provider. we generate a 'master' list to pass to
	// setActionDefinitions everytime a new 'set_provider' message comes in
	module.updateProviders(bf_provider, actions)
	let allProviders = module.getProviders()
	const masterProviderList: CompanionActionDefinitions = Object.assign({}, ...Object.values(allProviders))
	module.setActionDefinitions(masterProviderList)
}

/**
 * Create a `CompanionInputField` from a `BitFireCommandArg`.
 * @param name Name of the BF Command.
 * @param args data in the shape of a `BitFireCommandArg`
 */
function makeActionInput(name: string, args: BitFireCommandArg): CompanionInputFieldTextInput | CompanionInputFieldDropdown {
	const base = {
		id: name,
		label: name,
		tooltip: args.description,
	}

	if(args.type === 'dropdown' && Array.isArray(args.choices)) {
		return {
			...base,
			type: 'dropdown',
			choices: args.choices.map(choice => {
				const [id, label] = Object.entries(choice)[0]
				return {id,label}
			}),
			// Use default if it's present, otherwise first choice. an empty string as a last resort.
			default: args.default ?? Object.keys(args.choices[0])[0] ?? '',
		}
	}

	return {
		...base,
		type: 'textinput' as const,
		// Required should always be set in BitFireCommandArg, but this is safer for potential undefined
		required: args.required === true,
	}
}
/**
 * Create `CompanionActionDefinitions` from a `BitFireProviderMessage`.
 * @param providerMessage - 'set_provider' message parsed into a `BitFireProviderMessage` interface
 * @param module - `BitFireInstance` module
 */
function makeActionsFromProviderMessage(providerMessage: BitFireProviderMessage, module: BitFireInstance): CompanionActionDefinitions {
	let actions: CompanionActionDefinitions = {}

	// iterate over all the commands present in the provider message
	// and create the options portion of a CompanionActionDefinition
	for (const [commandName, bfCommand] of Object.entries(providerMessage.commands)) {
		const options = Object.entries(bfCommand.args).map(([name, args]) =>
			makeActionInput(name, args)
		)

		// Some providers share commands (i.e. All providers have a "send" command). Include the
		// provider name so shared commands don't get combined when we generate `masterProviderList`.
		let uniqueID = `${providerMessage.name}_${commandName}`;
		actions[uniqueID] = {
			name: providerMessage.name + ": " + commandName,
			description: bfCommand.description,
			options: options,
			callback: async (event) => {
				module.sendMessage(providerMessage.name, commandName, event.options)
			}
		}
	}

	return actions
}
