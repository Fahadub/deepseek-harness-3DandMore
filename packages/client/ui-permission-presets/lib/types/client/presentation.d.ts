/** Machine value of the preset that requires an explicit GUI risk gate. */
export declare const FULL_ACCESS_PRESET = "danger-full-access";
/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export declare function displayPresetName(name: string): string;
/**
 * Render a permission preset under its product label.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @returns the Full access product label or the conventional display name.
 */
export declare function displayPermissionPreset(value: string, name: string): string;
/** Machine values that carry locale-managed labels (common-namespace keys). */
export declare const PRESET_LABEL_KEYS: Readonly<Record<string, string>>;
/**
 * Localize a preset label when the machine value has a managed translation in
 * the common namespace (any bound translate function reaches it through the
 * lookup chain). Unknown values and missing keys fall back to the
 * conventional English display name.
 * @param value - preset machine value.
 * @param name - host-supplied preset name (the non-localized fallback input).
 * @param t - any namespace-bound translate function.
 * @returns the localized label, or the conventional display name.
 */
export declare function localizePresetLabel(value: string, name: string, t: (key: string) => string): string;
//# sourceMappingURL=presentation.d.ts.map