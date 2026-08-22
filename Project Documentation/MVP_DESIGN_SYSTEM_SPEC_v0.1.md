# MVP Design System Specification v0.1

**Product:** Shmup  
**Scope:** UI foundation, component architecture, and implementation governance  
**Status:** READY FOR IMPLEMENTATION  

## 1. Purpose

This document defines the canonical UI foundation for the Shmup MVP and the rules an implementation agent must follow when building or extending the interface.

The Design System must support future mechanics without prebuilding speculative UI. Extensibility is provided through stable tokens, composition, controlled variants, and an explicit extension process.

Behaviour or visual values not defined here must not be invented during implementation.

## 2. Governing principles

### 2.1 Minimalism

The interface must use the minimum number of visible elements and implementation concepts required to preserve usability, accessibility, and product functionality.

Minimalism applies to:

- what the player sees;
- the number of component types;
- the number of variants;
- the number of design tokens;
- the number of dependencies and supporting tools.

Minimalism must not remove required feedback, hide available actions, or make states ambiguous.

### 2.2 Controlled extensibility

The Design System must be extendable without becoming speculative.

- Do not create components for hypothetical future mechanics.
- Extend existing components through composition or an approved variant when semantics remain unchanged.
- Create a new component only when it has a distinct reusable semantic role.
- A visual difference alone is not sufficient reason for a new component.
- Future features must conform to the Design System; they must not bypass it.

### 2.3 Single source of truth

The implementation hierarchy is:

```text
Design Tokens
    ↓
Primitives
    ↓
Reusable Components
    ↓
Screen and Overlay Composition
```

Screens and feature code must not define independent visual systems.

## 3. Visual direction

The approved visual direction is restrained military-industrial UI:

- dark graphite surfaces;
- cold grey and steel tones;
- one muted cold-blue interaction accent;
- red reserved for damage, danger, and destructive semantics;
- minimal decorative framing;
- readability and function take priority over futuristic decoration;
- no neon, holographic HUD styling, or persistent decorative glow.

Panels use semi-opaque dark surfaces over backgrounds, a restrained border, and one consistent radius system. CSS backdrop blur is not used in the MVP.

## 4. Typography

The canonical UI typeface is `IBM Plex Mono`.

Allowed weights:

- Regular;
- Medium;
- SemiBold.

Rules:

- the font must be self-hosted by the game;
- font files must include the Cyrillic glyphs required for Ukrainian Pilot names;
- font ligatures must be disabled;
- uppercase is reserved for short utility labels where explicitly defined;
- ordinary labels, titles, and body text use normal casing;
- typography uses the approved bounded fluid type scale;
- arbitrary font sizes, weights, line heights, and letter spacing are prohibited.

## 5. Icon system

The canonical icon family is `Phosphor Icons` under its MIT license.

Only the `Regular` visual weight is allowed. `Thin`, `Light`, `Bold`, `Fill`, and `Duotone` styles must not be mixed into the MVP.

Rules:

- use self-hosted SVG assets or the smallest implementation-specific equivalent;
- ship only icons actually used by the game;
- do not load the complete icon set at runtime;
- icons use the Design System size and colour tokens;
- do not mix Phosphor with another icon family;
- do not use emoji as interface icons;
- in `Base Navigation`, an icon supplements its text label and does not replace it.

## 6. Design tokens

All reusable visual values must come from centralized Design Tokens grouped by semantic role:

- colour;
- typography;
- spacing;
- component size;
- border;
- radius;
- shadow;
- opacity;
- motion;
- layering.

Token names must express purpose rather than a screen-specific implementation. For example, a semantic interaction-accent token is valid; a token named for one particular button is not.

### 6.1 Colour tokens

```text
canvas                 #080B0E
surface                #11171C
surface-raised         #182128
surface-interactive    #202B33
panel-surface          rgba(17, 23, 28, 0.92)

border                 #34434E
border-strong          #526471

text-primary           #F1F5F7
text-secondary         #AEBBC4
text-disabled          #6E7A83

accent                 #65A9D6
accent-hover           #79B8DF
accent-pressed         #4D8DB7
on-accent              #071018

danger                 #D96767
danger-hover           #E37878
danger-pressed         #B94E4E
on-danger              #100607

focus-ring             #A8D8F4
overlay-scrim          rgba(4, 7, 9, 0.72)
```

- `accent` is reserved for interaction and selection.
- `danger` is reserved for damage, failure, and destructive actions.
- Colour must not be the only indicator of state.
- Screen-specific colour tokens are prohibited unless approved through the extension protocol.
- Panels displayed over Operations or Hangar backgrounds use `panel-surface`.
- Opacity must not be applied to the complete Panel element because text and controls must remain opaque.

### 6.2 Spacing tokens

```text
space-0    0
space-1    0.25rem
space-2    0.5rem
space-3    0.75rem
space-4    1rem
space-6    1.5rem
space-8    2rem
space-12   3rem
```

The scale is intentionally sparse. Intermediate values such as `space-5`, `space-7`, or `space-10` do not exist and must not be invented.

Internal component spacing uses this stable `rem` scale. Responsive behaviour is implemented through composition and bounded layout dimensions, not by independently scaling every gap.

### 6.3 Typography tokens

```text
text-caption
  size: clamp(0.75rem, 0.72rem + 0.10vw, 0.8125rem)
  weight: Regular
  line-height: 1.4

text-body
  size: clamp(0.875rem, 0.82rem + 0.16vw, 1rem)
  weight: Regular
  line-height: 1.5

text-control
  size: clamp(0.875rem, 0.84rem + 0.10vw, 0.9375rem)
  weight: Medium
  line-height: 1.25

text-heading
  size: clamp(1rem, 0.92rem + 0.24vw, 1.25rem)
  weight: Medium
  line-height: 1.3

text-title
  size: clamp(1.25rem, 1.08rem + 0.50vw, 1.75rem)
  weight: SemiBold
  line-height: 1.2
```

Feature-specific typography sizes are prohibited.

### 6.4 Border and radius tokens

```text
border-width       1px
radius-control     2px
radius-surface     4px
```

- Buttons and selectable items use `radius-control`.
- Panel and Overlay surfaces use `radius-surface`.
- Pill-shaped controls and decorative double borders are prohibited.

### 6.5 Shadow tokens

```text
shadow-overlay     0 0.5rem 2rem rgba(0, 0, 0, 0.40)
```

This is the only shadow in the MVP. Ordinary Panels do not use a shadow. Overlay surfaces use `shadow-overlay`.

### 6.6 Motion tokens

```text
motion-fast        100ms
motion-standard    160ms
easing-standard    ease-out
```

- `motion-fast` is used for hover, pressed, and focus feedback.
- `motion-standard` is used for opening and closing an Overlay.
- Base Screen transitions remain absent.
- Gameplay timing values are not Design Tokens.
- When `prefers-reduced-motion: reduce` is active, non-essential UI transitions are disabled.

### 6.7 Sizing rules

- Typography uses the approved bounded fluid `clamp()` scale.
- Large layout dimensions may use `%`, `vw`, `vh`, and `clamp()`.
- Internal component geometry uses approved tokens.
- Scaling the entire UI with CSS `transform: scale()` is prohibited.
- The minimum supported viewport remains `1280 × 600` CSS pixels.

### 6.8 State and layer tokens

```text
opacity-disabled   0.45

focus-outline      2px solid focus-ring
focus-offset       2px

layer-base         0
layer-hud          10
layer-utility      20
layer-scrim        100
layer-overlay      110
```

- Background and Screen content use `layer-base`.
- Combat Hull Integrity Bar uses `layer-hud`.
- Global Pause and Settings controls use `layer-utility`.
- Overlay Scrim and Surface use `layer-scrim` and `layer-overlay` respectively.
- Debug Overlay uses the same Overlay layers because only one blocking Overlay may be open.
- Arbitrary high layer values such as `z-index: 9999` are prohibited.

### 6.9 Prohibited arbitrary values

Screen and feature code must not introduce an unapproved:

- colour;
- font size or weight;
- spacing value;
- component height;
- border or radius;
- shadow or opacity;
- animation duration or easing;
- interaction-state presentation.

Explicit product coordinates, percentages, and asset focal positions defined by a product specification are not Design Tokens. The approved `50% / 50%` Mission Point position is one such exception.

If an implementation requires a missing reusable value, the agent must report a Design System blocker instead of inventing one.

## 7. Initial component inventory

This is the minimum initial inventory, not a permanently closed list.

### 7.1 Primitives

- `Text`;
- `Icon`;
- `Button`;
- `Panel`;
- `Overlay`;
- `Progress Bar`;
- `Checkbox`;
- `Divider`.

### 7.2 Reusable components

- `Navigation Item`;
- `Base Navigation`;
- `Settings Button`;
- `Credits Panel`;
- `Mission Point`;
- `Field Row`;
- `Hull Integrity Bar`;
- `Weapon Option`;
- `Aircraft Configuration Panel`.

### 7.3 Compositions

- `Operations Screen`;
- `Hangar Screen`;
- `Mission Details Overlay`;
- `Weapon Selection Overlay`;
- `Settings Overlay`.

A Screen or Overlay composes primitives and reusable components. It must not implement its own independent button, panel, typography, or interaction-state system.

## 8. Component contract

### 8.1 Text

`Text` accepts only these approved presentation roles:

```text
style: caption | body | control | heading | title
tone: primary | secondary | disabled | danger
```

- Semantic markup is selected by content hierarchy, not by visual style.
- A `title` presentation role does not automatically imply an HTML `h1` element.
- Screen code must not override font size, weight, line height, or letter spacing.
- Ellipsis is allowed only where a feature specification explicitly permits truncation.
- Required information must not be silently truncated.

### 8.2 Icon

```text
small:  1rem
medium: 1.25rem
large:  1.5rem
```

- Icon colour inherits from its parent component.
- Arbitrary SVG size and stroke-width overrides are prohibited.
- A decorative icon is hidden from assistive technology.
- A functional icon must have an accessible name supplied by its parent control.
- `Icon` does not own a background, border, or interaction state.

### 8.3 Button

The MVP uses one canonical `Button` primitive with only these semantic variants:

- `primary`;
- `secondary`;
- `destructive`.

Its geometry is:

```text
height:             2.5rem
horizontal padding: space-4
content gap:        space-2
radius:             radius-control
typography:         text-control
```

Its approved configuration is:

```text
width:   content | fill
content: label | icon-and-label | icon-only
```

Action names are content, not component types. `Start Mission`, `Cancel`, `Repair`, and weapon confirmation must not become separate button implementations.

All button instances inherit the same approved:

- structure;
- typography;
- height and padding rules;
- icon alignment;
- interaction states;
- disabled behaviour.

- `icon-only` is allowed only for a commonly understood utility action and requires an accessible name.
- A visible label is the default button content.
- The MVP does not include a loading-spinner state.
- A button that prevents repeated submission enters `disabled` for the applicable operation window.
- A disabled button remains visible and does not react to hover, pressed, or activation input.
- Feature specifications determine the order of multiple actions.
- `Settings Button` is an icon-only `Button` using the Phosphor `gear` icon and the accessible name `Settings`.

### 8.4 Panel

The canonical `Panel` uses:

```text
surface: surface
border:  border-width solid border
radius:  radius-surface

padding:
  compact: space-3
  default: space-4
```

- `Credits Panel` uses compact padding.
- `Base Navigation` and `Aircraft Configuration Panel` use default padding.
- Panels displayed over Operations or Hangar backgrounds replace opaque `surface` with `panel-surface`.
- Panel does not use a shadow.
- Panel does not define Screen layout.
- Additional visual variants require approval through the extension protocol.

`Navigation Panel`, `Aircraft Configuration Panel`, and `Credits Panel` must derive their shared surface behaviour from `Panel`.

### 8.5 Overlay

`Mission Details Overlay`, `Weapon Selection Overlay`, and `Settings Overlay` must derive blocking, backdrop, focus, surface, and closing behaviour from `Overlay` unless a product specification explicitly defines a difference.

The canonical structure is:

```text
Overlay
├── Scrim
└── Overlay Surface
    ├── Header
    ├── Content
    └── Actions
```

- At most one blocking Overlay may be open.
- Underlying UI remains visible but non-interactive.
- Keyboard focus moves inside the Overlay when it opens.
- `Tab` and `Shift+Tab` keep focus within the open Overlay.
- Closing restores focus to the control that opened the Overlay when that control still exists.
- Overlay Surface uses `surface-raised`, `radius-surface`, and `shadow-overlay`.
- Overlay actions use the canonical `Button`.
- Clicking the Scrim does not close an Overlay.
- `Esc` closes any Base blocking Overlay using the same result as its explicit `Cancel` or `Close` action.

### 8.6 Base Navigation

```text
width:    clamp(12rem, 15vw, 15rem)
height:   100% of viewport
padding:  space-4
item gap: space-2
```

- It is a transparent structural navigation layer and does not use a Panel surface, enclosing border, radius, or shadow.
- It touches the left viewport edge without an external margin.
- `Operations` and `Hangar` are aligned at the top.
- It has no logo, heading, decorative footer, or scrolling at a supported viewport.
- The current Base Screen background fills the viewport beneath it; foreground content uses the safe area beside it.
- Only the individual Navigation Items are opaque within this layer.

### 8.7 Navigation Item

```text
height:         2.5rem
width:          fill
padding-inline: space-3
content gap:    space-3
icon size:      medium
typography:     text-control
```

- Default uses an opaque `surface` background and secondary text.
- Hover uses `surface-interactive`.
- Active uses `surface-interactive`, primary text, and a left accent line.
- Active does not use a filled-blue background.
- Focus-visible uses `focus-ring`.
- A blocking Overlay disables interaction without hiding the item.

### 8.8 Settings Button

- It uses the canonical `Button` with `secondary` variant and icon-only content.
- Its dimensions are `2.5rem × 2.5rem`.
- It uses the Phosphor `gear` icon at medium size.
- Its accessible name is `Settings`.
- It is positioned `space-4` from the top and right edges of Base content.
- The MVP does not add a tooltip.

### 8.9 Credits Panel

- It uses compact `Panel` padding.
- It contains one primary `text-body` element: `Credits: <current value>`.
- It is positioned `space-4` from the top and left edges of Base content.
- It does not include a currency icon.

### 8.10 Mission Point

```text
Mission Point
├── Marker Button
│   └── Phosphor crosshair icon
└── Text label: Interception
```

- Marker Button interactive area is `2.5rem × 2.5rem`.
- The icon uses large size and the label uses `text-control`.
- Marker-to-label gap is `space-2`.
- Marker and label form one interactive action.
- Hover, pressed, and focus-visible are owned by the component.
- The MVP has no active, locked, completed, or expired variant.
- Mission Point is static and has no persistent pulse or other idle animation.

### 8.11 Field Row

```text
Field Row
├── Label
└── Value
```

```text
minimum height:   2rem
column gap:       space-4
vertical padding: space-2
label:            text-caption / secondary
value:            text-body / primary
```

- Label is left-aligned and Value is right-aligned.
- Long values wrap instead of being silently truncated.
- Adjacent rows use the canonical `Divider`.
- Pilot, Credits, Cost, Hull, and weapon values do not create separate row components.

### 8.12 Hull Integrity Bar

```text
height: 0.5rem
width:  fill
track:  surface-interactive
fill:   accent
radius: radius-control
```

- Fill is proportional to Hull Integrity from `0` to `100`.
- The displayed fill is clamped to the visual range without changing authoritative gameplay state.
- Numeric `current / 100` text is a separate element where the feature specification requires it.
- The Bar has no gradient, segmentation, or animation.
- Fill colour does not change at arbitrary Hull thresholds.
- Combat and Hangar use the same primitive; Combat omits the numeric value.

### 8.13 Aircraft Configuration Panel

```text
width:       clamp(18rem, 24vw, 22rem)
height:      available content height
padding:     default
section gap: space-6
```

Its fixed content order is:

```text
Aircraft name
Pilot
Hull Integrity
Primary Weapon
Repair, only when damaged
```

- It is positioned directly to the right of Base Navigation.
- Internal vertical scrolling is permitted only if content physically cannot fit.
- All approved MVP sections must fit without scrolling at `1280 × 600`.
- Repair is not nested inside another Panel.

### 8.14 Weapon Option

```text
Weapon Option
├── Selection indicator
├── Weapon name
└── Weapon statistics
```

- The entire option is interactive and uses radio-selection semantics.
- Selected uses `surface-interactive` and `border-strong`.
- Hover, pressed, and focus-visible are owned by the component.
- Selection changes pending choice only and does not immediately equip the weapon.
- Weapon statistics use `Field Row`.
- Weapon types do not create separate UI component implementations.

### 8.15 Checkbox

```text
Checkbox
├── Native checkbox control
├── Phosphor check icon
└── Text label
```

- Control size is `1.25rem`.
- Control-to-label gap is `space-2`.
- Label uses `text-body`.
- Label and control form one interactive area.
- Native boolean semantics are preserved.
- It supports default, hover, pressed, focus-visible, checked, and disabled states.
- Checked uses `accent`.
- `Settings Overlay` uses this canonical Checkbox for `Mouse Movement Enabled`.
- The setting changes immediately; there is no `Save` or `Apply` action.
- The MVP does not create a separate Toggle component.

### 8.16 Shared Overlay Surface

```text
padding:        space-6
section gap:    space-4
action gap:     space-3
maximum height: calc(100vh - 2 × space-8)
```

- Overlay Surface is centred in the viewport.
- When vertical space is insufficient, only Content scrolls; Header and Actions remain visible.
- Arbitrary absolute positioning inside Overlay Surface is prohibited.

### 8.17 Mission Details Overlay composition

```text
width: clamp(24rem, 36vw, 32rem)
```

- Title uses `text-heading`.
- Description uses `text-body`.
- Reward uses `Field Row`.
- `Start Mission` is primary and placed on the left.
- `Cancel` is secondary and placed on the right.
- The action row distributes the two buttons to opposite sides.
- Initialization failure uses `Text` with danger tone and does not create a one-use Alert component.

### 8.18 Weapon Selection Overlay composition

```text
width: clamp(32rem, 50vw, 44rem)
```

- Weapon Options are stacked vertically with `space-3` between them.
- `Confirm` is primary and placed on the left.
- `Cancel` is secondary and placed on the right.
- The MVP does not use a two-column weapon-card grid.

### 8.19 Settings Overlay composition

```text
width: clamp(20rem, 30vw, 26rem)
```

```text
Title: Settings
Checkbox: Mouse Movement Enabled
Button: Close
```

- Base and Combat use the same composition and component implementation.
- `Close` is secondary.
- There is no `Save`, `Apply`, or `Reset` action.
- The Checkbox updates current session state immediately.
- `Esc` is equivalent to `Close`.

### 8.20 Combat Overlay reuse

`Pause Overlay`, `Mission Result Overlay`, and `Debug Overlay` must use the canonical `Overlay`, `Text`, `Button`, `Field Row`, and Design Tokens. Combat must not create a parallel UI component library.

### 8.21 Combat utility controls

```text
[Pause] [Settings]
```

- The cluster is positioned `space-4` from the top and right viewport edges.
- Buttons are `2.5rem × 2.5rem` icon-only secondary Buttons separated by `space-2`.
- Pause uses Phosphor `pause` with accessible name `Pause`.
- Settings uses Phosphor `gear` with accessible name `Settings`.
- These are global utility controls, not Combat HUD.

### 8.22 Pause Overlay composition

```text
width: clamp(20rem, 30vw, 26rem)

Title: Paused

[Resume]                     [Return to Base]
```

- `Resume` is primary and placed on the left.
- `Return to Base` is destructive and placed on the right.
- No additional confirmation Overlay is displayed.
- While open, `Esc` or `P` is equivalent to `Resume`.

### 8.23 Mission Result Overlay composition

```text
width: clamp(20rem, 30vw, 26rem)
```

- Success displays `Mission Complete`, `Reward: 1 Credit`, and `Continue`.
- Defeat displays `Mission Failed`, `Reward: 0 Credits`, and `Continue`.
- Title uses `text-heading`; Reward uses `Field Row`.
- `Continue` is a fill-width primary Button.
- `Esc` and Scrim interaction do not close Mission Result Overlay.
- The result flow can be left only through `Continue`.

### 8.24 Debug Overlay composition

```text
width: clamp(32rem, 50vw, 44rem)
```

Its fixed section order is:

```text
Title: Debug
Observability
God Mode
Hull Controls
Spawn Controls
Result Controls
Close
```

- Observability uses `Field Row`.
- God Mode uses the canonical `Checkbox`.
- Set Hull and Spawn actions are secondary Buttons.
- `Win Mission` is primary; `Lose Mission` is destructive; `Close` is secondary.
- Related action Buttons use two columns.
- Content may scroll while Header and Close remain visible.
- Debug UI exists only when `DEV_MODE = true`.
- From running Combat, `F1` opens Debug and pauses Combat.
- From `Pause Overlay`, `F1` replaces Pause with Debug; one blocking Overlay remains open at a time.
- `F1` is ignored while Settings or Mission Result is open.
- `F1` or `Esc` closes Debug and resumes only if Debug opened from running Combat. If it replaced Pause or a browser safety pause was latched, closing opens `Pause Overlay` and requires explicit `Resume`.
- A debug action that ends the mission closes Debug Overlay through the normal result flow.

### 8.25 Combat Settings Overlay

- It uses the same Settings composition as Base.
- It can open only while Combat is active, running, and no blocking Overlay is open.
- Opening it pauses Combat.
- `Esc` is equivalent to `Close`; either action closes Settings and resumes Combat unless a browser safety pause was latched.
- If a browser safety pause was latched, closing Settings opens `Pause Overlay` and requires explicit `Resume`.
- Clicking outside does not close it.
- Pause Overlay and Settings Overlay cannot be open simultaneously.
- If Combat is paused or any blocking Overlay is open, the command to open Settings is ignored.

## 9. Interaction states

Every interactive primitive must implement every state applicable to its product behaviour:

- default;
- hover;
- pressed;
- focus-visible;
- disabled.

State presentation belongs to the parent primitive. A Screen may select an approved variant and provide state, but must not restyle that state locally.

Animations must be short and functional. Persistent animation is prohibited unless a product specification explicitly requires it. Mission Point is static in the MVP.

### 9.1 Focus-visible

- Interactive elements use `focus-outline` and `focus-offset` through `:focus-visible`.
- Focus indication must not change layout.
- Screen composition must not hide or replace the canonical focus indication.

### 9.2 Button state matrix

```text
primary/default:     accent / on-accent
primary/hover:       accent-hover / on-accent
primary/pressed:     accent-pressed / on-accent

secondary/default:  surface / text-primary / border
secondary/hover:    surface-interactive / text-primary / border-strong
secondary/pressed:  surface-raised / text-primary / border-strong

destructive/default: danger / on-danger
destructive/hover:   danger-hover / on-danger
destructive/pressed: danger-pressed / on-danger

disabled:            opacity-disabled
```

- Disabled has no hover, pressed, or activation response.
- `Cancel` uses secondary, not destructive.
- Destructive is reserved for a negative irreversible or session-ending action, including `Return to Base` and `Lose Mission`.

### 9.3 Checkbox state matrix

```text
unchecked: surface / border-strong
checked:   accent / accent border / on-accent check icon
hover:     focus-ring border
disabled:  opacity-disabled
```

Pressed uses `motion-fast`; focus-visible uses the shared focus indication.

### 9.4 Selection state matrix

`Navigation Item` and `Weapon Option` share this semantic state model:

- hover uses `surface-interactive`;
- selected or active uses `surface-interactive` plus a structural accent indicator;
- focus-visible uses the shared focus indication;
- disabled uses `opacity-disabled` without hover or pressed feedback.

The structural accent indicator is `calc(2 × border-width)` wide and uses `accent`. Navigation uses an accent line; Weapon Option uses its radio indicator and stronger border. Colour is not the only state signal.

### 9.5 Input feedback

- Interactive elements use pointer cursor.
- Disabled controls use default cursor and remain visibly disabled.
- Hover is never required to discover a label or current state.
- Pressed feedback begins immediately.
- All actions remain keyboard-operable.
- Icon-only Buttons require an accessible name.

## 10. Accessibility and keyboard contract

### 10.1 MVP accessibility boundary

The MVP guarantees keyboard-operable UI, semantic controls, visible focus, Overlay focus management, accessible names, non-colour-only state indication, and reduced-motion handling.

The product does not claim formal WCAG certification or complete non-visual accessibility for real-time Combat. Screen-reader narration of Combat events is outside the MVP.

### 10.2 Semantic controls

- Actions use native `button` elements.
- Settings and God Mode use native `input type="checkbox"` semantics.
- Weapon Options use one native radio-group semantic model.
- Base Navigation uses navigation semantics and identifies the active item as current.
- Clickable `div` or `span` elements must not replace native controls.
- Decorative icons are hidden from assistive technology; functional icon-only controls receive their accessible name from the parent Button.

### 10.3 Keyboard behaviour

- `Tab` moves focus forward and `Shift+Tab` moves it backward.
- `Enter` or `Space` activates a focused Button.
- `Space` toggles a focused Checkbox.
- Disabled controls do not receive sequential keyboard focus and do not activate.
- Every keyboard-focused interactive element uses the canonical `focus-ring` without layout shift.
- Pointer interaction must not remove keyboard operability.

### 10.4 Overlay focus

When an Overlay opens, initial focus is:

```text
Mission Details Overlay   Start Mission
Weapon Selection Overlay equipped Weapon Option
Settings Overlay          Mouse Movement Enabled
Pause Overlay             Resume
Mission Result Overlay    Continue
Debug Overlay             God Mode
```

- `Tab` and `Shift+Tab` cycle within the open Overlay.
- Closing a Base Overlay restores focus to its still-existing opener.
- A transition that removes the opener does not restore focus to a detached element.
- Operations and Hangar do not repeat their active Navigation Item label as a visible Screen heading.
- After navigation to Operations or Hangar, programmatic focus moves to the active Navigation Item that visibly identifies the new Screen; no hidden Screen heading becomes a focus target.

### 10.5 Base sequential focus order

```text
Operations navigation item
Hangar navigation item
current Screen actions in visual order
Settings Button
```

- Operations Screen action order contains `Mission Point`.
- Hangar Screen action order contains `Change Weapon`, then enabled visible `Repair`, then Settings.
- A visible disabled Repair Button is omitted from sequential focus order.

### 10.6 Weapon Selection keyboard behaviour

- Initial focus is the currently equipped Weapon Option.
- `Arrow Up` and `Arrow Down` move pending selection within the radio group.
- `Space` selects the focused option.
- `Tab` proceeds from the radio group to `Confirm` and then `Cancel`.
- Focus movement or pending selection does not equip a weapon until `Confirm` is activated.
- `Esc` discards pending selection through the approved Cancel flow.

### 10.7 Combat UI keyboard behaviour

- `Pause Button` and `Settings Button` are in sequential focus order.
- Moving focus with `Tab` does not pause Combat.
- Activating Pause or Settings through `Enter` or `Space` has the same result as pointer activation.
- While a blocking Overlay is open, gameplay shortcuts are ignored except the shortcut explicitly assigned to close or operate that Overlay.

### 10.8 Accessible state

- Pause and Settings icon-only Buttons have accessible names `Pause` and `Settings`.
- The Combat Hull Integrity Bar exposes progress semantics with minimum `0`, maximum `100`, and current Hull Integrity while remaining visually non-numeric.
- Active Navigation Item, selected Weapon Option, and checked Checkbox expose their state semantically.
- Credits, weapon statistics, and mission-result content remain accessible text.
- Important state must not be communicated by colour alone.

### 10.9 Deferred accessibility features

The MVP does not add control remapping, high-contrast mode, colour-blind presets, a text-size setting, skip links, an Accessibility Settings category, hidden duplicate controls, or speculative text inputs.

If text-input controls are added in a later scope, gameplay shortcuts must be suppressed while focus is inside them.

## 11. Extension protocol

Before adding a token, variant, primitive, or reusable component, the implementation agent must:

1. Identify the unmet semantic or behavioural need.
2. Search the current inventory for an existing solution.
3. Test whether composition solves the need.
4. Test whether an existing component can accept a semantically valid approved variant.
5. Demonstrate why reuse or composition would be incorrect.
6. Return the proposed extension as a blocker for product/design approval.
7. Update the inventory and all applicable verification checks only after approval.

The agent must not silently expand the Design System.

## 12. Duplication rule

When the same UI pattern is needed a second time, the implementation agent must stop copy-pasting and evaluate reuse or extraction.

Extraction must preserve a clear semantic role. Superficial similarity must not produce an excessively configurable universal component.

## 13. Scope control

The MVP Design System does not include:

- Storybook;
- a standalone documentation website;
- a theme editor;
- a light theme;
- a component playground;
- a token generator;
- a general-purpose UI framework;
- a library intended for unrelated games;
- speculative components for unapproved mechanics.

### 13.1 Runtime asset contract

The runtime font manifest is exactly:

```text
assets/runtime/fonts/
├── ibm-plex-mono-regular.woff2
├── ibm-plex-mono-medium.woff2
└── ibm-plex-mono-semibold.woff2
```

- Fonts are self-hosted; no font CDN is used.
- Italics and unused weights are not included.
- Font files must contain the Ukrainian Cyrillic glyphs required by Pilot names.
- The fallback stack is `"IBM Plex Mono", ui-monospace, monospace`.
- All three approved weights are included in the bounded Boot preload manifest so later Screens and Overlays require no typography-loading state.

The runtime icon manifest is exactly:

```text
assets/runtime/icons/
├── gear.svg
├── pause.svg
├── crosshair.svg
├── map-trifold.svg
├── warehouse.svg
└── check.svg
```

The mapping is:

- `gear` — Settings;
- `pause` — Pause;
- `crosshair` — Mission Point;
- `map-trifold` — Operations;
- `warehouse` — Hangar;
- `check` — Checkbox.

- All icons use Phosphor Regular.
- Individual self-hosted SVG files are used instead of the complete package or icon font.
- SVG colour follows `currentColor`.
- Local geometry or weight modification is prohibited.

Required license files are:

```text
assets/licenses/
├── IBM-Plex-OFL-1.1.txt
└── Phosphor-MIT.txt
```

They remain in the repository and do not require an MVP player-facing license screen.

### 13.2 Asset failure behaviour

- Font failure uses the approved fallback stack and does not block the game.
- A failed decorative icon does not display a broken-image marker.
- A failed icon-only Settings or Pause control displays the text fallback `Settings` or `Pause` and retains its accessible name.
- A failed Navigation icon does not hide its text label.
- New icons require the Design System extension protocol.
- A feature must not import the complete font or icon family for convenience.
- All approved runtime font and icon files load in parallel during the single bounded Boot preload defined by the Master Design Document.
- A failed or timed-out font or icon uses its approved stable fallback for the complete current session; late completion does not replace that fallback.
- Screen navigation, Overlay opening, and viewport resize must not repeat font or icon requests.

## 14. Compliance and enforcement

Compliance cannot depend on the implementation agent remembering prose. It must be enforced at three levels.

### 14.1 Architectural enforcement

- tokens have one canonical definition location;
- primitives have one canonical implementation each;
- feature and Screen code consumes those primitives instead of reproducing them;
- the component inventory is maintained alongside the implementation;
- public component variants are explicit and finite.

### 14.2 Automated enforcement

Once the implementation stack and file structure are known, the project must add the smallest suitable automated checks for:

- prohibited raw colours outside the token definition;
- prohibited arbitrary spacing, typography, radius, and motion values;
- prohibited imports from unapproved icon families;
- direct use of source JPEG backgrounds at runtime;
- duplicate or bypass implementations of canonical primitives.

The exact tools and rules must match the approved implementation stack and must not be invented before that stack is known.

A failed Design System check must fail the normal implementation verification command.

### 14.3 Mandatory UI audit

The implementation agent must run and report a Design System audit:

- after each new Screen or Overlay;
- after introducing or changing a primitive;
- after introducing or changing a reusable component;
- after adding a new mechanic with UI;
- before declaring an implementation milestone complete.

The audit must answer:

1. Were any raw visual values added outside the token source?
2. Was every UI element built from an approved primitive or component?
3. Was any existing component duplicated?
4. Were new variants or states introduced without approval?
5. Are all applicable interaction states present and consistent?
6. Was only the required subset of fonts, icons, and images shipped?
7. Does the new UI remain within the performance budget?

The implementation agent must provide evidence from automated checks and identify the inspected files. A statement such as “looks consistent” is not sufficient evidence.

### 14.4 Review gate

Work containing UI is not complete if:

- the mandatory audit was not reported;
- an automated Design System check fails;
- a required component bypasses the canonical hierarchy;
- an unapproved token, component, variant, or state exists;
- a Design System blocker remains unresolved.

## 15. Implementation-agent directive

The implementation agent must:

- compose UI from approved Design System elements;
- prefer reuse and composition over expansion;
- keep the player-facing interface minimal;
- preserve enough structural flexibility for approved future mechanics;
- treat missing Design System definitions as blockers;
- never invent product behaviour or visual rules;
- perform and report the mandatory UI audit at every defined gate.

## 16. Acceptance Criteria

### DS-AC-001 — Canonical token usage

**Given** UI implementation code outside the canonical token source,  
**when** automated Design System checks run,  
**then** unapproved raw colours, typography, spacing, radius, shadow, opacity, motion, or layer values fail verification.

### DS-AC-002 — Canonical Button reuse

**Given** any MVP action is rendered,  
**when** its implementation is inspected,  
**then** it uses the canonical `Button` with an approved variant and does not define an action-specific button implementation.

### DS-AC-003 — Complete interaction states

**Given** an interactive component is enabled, focused, pressed, hovered, selected, or disabled where applicable,  
**when** that state is activated,  
**then** the component uses the approved state matrix without Screen-level restyling.

### DS-AC-004 — Keyboard focus

**Given** the player navigates by keyboard,  
**when** focus reaches an interactive element,  
**then** the canonical focus-visible indication is shown without changing layout and every action remains operable.

### DS-AC-005 — Blocking Overlay behaviour

**Given** a blocking Overlay opens,  
**when** the player navigates with `Tab` or `Shift+Tab`,  
**then** focus remains within the Overlay, underlying UI is non-interactive, and closing restores focus to the still-existing opening control.

### DS-AC-006 — Overlay composition

**Given** any approved Base or Combat Overlay renders,  
**when** its structure is inspected,  
**then** it uses the canonical Scrim, Overlay Surface, Text, Button, Field Row, Checkbox, and token contracts applicable to its content.

### DS-AC-007 — Minimum viewport

**Given** a `1280 × 600` CSS-pixel viewport,  
**when** each Base Screen and approved Overlay renders,  
**then** required controls remain visible and usable, and only explicitly permitted Overlay Content may scroll.

### DS-AC-008 — Runtime font subset

**Given** the game loads its UI typography,  
**when** network and runtime assets are inspected,  
**then** only the approved self-hosted IBM Plex Mono weights are used, Ukrainian Pilot names render correctly, and no font CDN is requested.

### DS-AC-009 — Runtime icon subset

**Given** all MVP UI is loaded,  
**when** shipped assets and imports are inspected,  
**then** only approved Phosphor Regular SVGs are present, the complete icon package or icon font is absent, and icons inherit `currentColor`.

### DS-AC-010 — Asset failure fallback

**Given** a font or icon asset fails to load,  
**when** affected UI renders,  
**then** the game remains usable, required labels and accessible names remain available, and no broken-image marker replaces a functional control.

### DS-AC-011 — Reduced motion

**Given** `prefers-reduced-motion: reduce` is active,  
**when** UI state or Overlay transitions occur,  
**then** non-essential UI motion is disabled without delaying feedback or changing product behaviour.

### DS-AC-012 — Controlled extension

**Given** implementation requires a missing token, variant, primitive, component, or icon,  
**when** the agent cannot satisfy the need through approved reuse or composition,  
**then** it reports a Design System blocker and does not silently expand the system.

### DS-AC-013 — Native keyboard operation

**Given** an enabled Button, Checkbox, Weapon Option, or Navigation Item receives keyboard focus,  
**when** the player uses its approved native keyboard input,  
**then** it exposes visible focus and performs the same product action as pointer activation without a duplicate hidden control.

### DS-AC-014 — Initial Overlay focus

**Given** an approved Overlay opens,  
**when** focus is assigned,  
**then** it moves to the explicitly approved initial control and remains trapped within the Overlay until the Overlay closes.

### DS-AC-015 — Screen-transition focus

**Given** navigation or a result flow opens Operations or Hangar,  
**when** the previous focused control no longer owns the current context,  
**then** programmatic focus moves to the active Navigation Item that visibly identifies the new Base Screen, no duplicate visible Screen heading is rendered, and no hidden Screen heading becomes a focus target.

### DS-AC-016 — Accessible Hull state

**Given** the Combat Hull Integrity Bar is rendered or updated,  
**when** assistive technology reads it,  
**then** it exposes progress minimum `0`, maximum `100`, and current Hull Integrity without adding a visible numeric label.

### DS-AC-017 — Keyboard-only audit gate

**Given** a Screen or Overlay is implemented or materially changed,  
**when** its mandatory UI audit is performed,  
**then** evidence confirms logical focus order, complete action reachability, focus containment and restoration, disabled-control behaviour, and defined transition focus.

### DS-AC-018 — Bounded Design System asset preload

**Given** the application starts its bounded Boot preload,  
**when** approved fonts and icons load, fail, or reach the `5 s` deadline,  
**then** each uses its prepared file or stable fallback for the session without a later visual swap or additional Screen-level loading state.

### DS-AC-019 — No repeated UI asset loading

**Given** Boot has completed,  
**when** the player navigates, opens Overlays, enters Combat, or resizes the viewport,  
**then** the UI does not repeat font or icon requests through application loading logic.

### DS-AC-020 — Mandatory audit

**Given** a new Screen, Overlay, component, UI mechanic, or implementation milestone is complete,  
**when** work is presented for review,  
**then** the implementation agent reports the mandatory audit with automated-check results and inspected files.

## 17. Current readiness

The Design System architecture, Design Tokens, component contracts, runtime asset contract, governance rules, and acceptance criteria are approved.

The final consistency review passed on `2026-08-20`. No unresolved S0–S2 Design System behaviour remains in the approved MVP scope.

**PRODUCT AND UI CONTRACT READY**

The final cross-document technical audit passed on `2026-08-20`. The Design System is ready for explicitly assigned implementation slices and remains mandatory for every applicable UI change.
