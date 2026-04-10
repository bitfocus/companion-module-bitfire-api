import type { BitFireInstance } from './main.js'
import { CompanionPresetDefinitions } from '@companion-module/base'

export function UpdatePresets(self: BitFireInstance): void {
	const presets: CompanionPresetDefinitions = {}
	self.setPresetDefinitions(presets)
}
