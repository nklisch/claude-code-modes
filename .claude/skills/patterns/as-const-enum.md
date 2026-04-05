# Pattern: `as const` Enum Arrays

Enumerated values are defined as `as const` arrays with a derived union type. This gives both runtime-accessible arrays (for validation) and compile-time types (for inference), from a single source of truth.

## Rationale

Without `as const`, an `Array<string>` doesn't carry type information useful for narrowing. Without a union type, function signatures can't express "one of these specific values." The pattern gives both: the array is used for runtime validation via `.includes()`, the type is used in function signatures.

## Examples

### Example 1: Agency axis
**File**: `src/types.ts:1-2`
```typescript
export const AGENCY_VALUES = ["autonomous", "collaborative", "surgical"] as const;
export type Agency = (typeof AGENCY_VALUES)[number];
// Agency is exactly: "autonomous" | "collaborative" | "surgical"
```

### Example 2: Quality axis
**File**: `src/types.ts:4-5`
```typescript
export const QUALITY_VALUES = ["architect", "pragmatic", "minimal"] as const;
export type Quality = (typeof QUALITY_VALUES)[number];
```

### Example 3: Preset names
**File**: `src/types.ts:10-18`
```typescript
export const PRESET_NAMES = [
  "create", "extend", "safe", "refactor", "explore", "none",
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];
```

### Example 4: Runtime validation with `.includes()`
**File**: `src/args.ts:83-89`
```typescript
// Uses the const array for runtime .includes() check
function validateAxisValue<T extends string>(
  value: unknown,
  validValues: readonly T[],   // receives AGENCY_VALUES, QUALITY_VALUES, etc.
  flagName: string,
): T {
  if (!(validValues as readonly string[]).includes(value as string)) {
    throw new Error(`Invalid --${flagName} value: "${value}". Must be one of: ${validValues.join(", ")}`);
  }
  return value as T;
}
```

### Example 5: Iterating all values in tests
**File**: `src/e2e.test.ts:73`
```typescript
import { PRESET_NAMES } from "./types.js";
// ...
for (const preset of PRESET_NAMES) {
  // automatically covers all presets — no hardcoded list
}
```

## When to Use

- Any domain value that is one of a fixed set: modes, presets, states, categories
- When you need both runtime validation and TypeScript narrowing from the same definition

## When NOT to Use

- Values that change at runtime — `as const` requires compile-time knowledge
- Very large sets where a `Set<string>` would perform better for lookup

## Common Violations

- Defining the array and type separately (e.g., `type Agency = "autonomous" | ...` and then a separate `AGENCY_VALUES` — risk of drift)
- Hardcoding the values in tests instead of importing the `*_VALUES` / `*_NAMES` constant
- Using the type without the const array (no runtime validation possible)
