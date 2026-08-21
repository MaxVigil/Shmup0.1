// Design System enforcement (DS-AC-001): raw design-token values are allowed
// only in the canonical token source (src/ui/styles/tokens.css). Every other
// stylesheet must reference tokens through var(--...).
export default {
  extends: ['stylelint-config-standard'],
  overrides: [
    {
      files: ['src/ui/styles/tokens.css'],
      rules: {
        'declaration-property-value-disallowed-list': null,
      },
    },
  ],
  rules: {
    'declaration-property-value-disallowed-list': {
      // Colour
      color: ['/^(?!var\\(|0$|none$|transparent$|currentcolor$|inherit$)/'],
      'background-color': [
        '/^(?!var\\(|0$|none$|transparent$|currentcolor$|inherit$)/',
      ],
      // Border / radius / shadow / opacity / layers
      border: ['/^(?!var\\(|0$|none$)/'],
      'border-color': ['/^(?!var\\(|0$|none$|transparent$|inherit$)/'],
      'border-width': ['/^(?!var\\(|0$)/'],
      'border-radius': ['/^(?!var\\(|0$)/'],
      'box-shadow': ['/^(?!var\\(|none$)/'],
      opacity: ['/^(?!var\\(|0$|1$)/'],
      'z-index': ['/^(?!var\\(|0$|auto$)/'],
      // Typography
      'font-family': ['/^(?!var\\()/'],
      'font-size': ['/^(?!var\\()/'],
      'font-weight': ['/^(?!var\\()/'],
      'line-height': ['/^(?!var\\(|0$|normal$)/'],
      'letter-spacing': ['/.+/'],
      // Spacing
      padding: ['/^(?!var\\(|0$)/'],
      'padding-inline': ['/^(?!var\\(|0$)/'],
      'padding-block': ['/^(?!var\\(|0$)/'],
      margin: ['/^(?!var\\(|0$)/'],
      'margin-inline': ['/^(?!var\\(|0$)/'],
      'margin-block': ['/^(?!var\\(|0$)/'],
      gap: ['/^(?!var\\(|0$)/'],
      'row-gap': ['/^(?!var\\(|0$)/'],
      'column-gap': ['/^(?!var\\(|0$)/'],
      // Motion (approved structural exception: reduced-motion `none`)
      transition: ['/^(?!var\\(|none$)/'],
      'transition-duration': ['/^(?!var\\()/'],
      'transition-timing-function': ['/^(?!var\\()/'],
      animation: ['/^(?!var\\(|none$)/'],
      'animation-duration': ['/^(?!var\\()/'],
      'animation-timing-function': ['/^(?!var\\()/'],
      'animation-iteration-count': ['/^(?!var\\()/'],
      // Visual focus
      outline: ['/^(?!var\\()/'],
      'outline-offset': ['/^(?!var\\()/'],
      // Sizing / component height (approved structural exceptions: 100%,
      // 100vh, calc(...), clamp(...), 0, auto; clamp(...) covers the approved
      // bounded fluid composition widths, DS §7–8)
      height: ['/^(?!var\\(|100%$|100vh$|0$|auto$)/'],
      width: ['/^(?!var\\(|100%$|100vh$|0$|auto$|clamp\\()/'],
      'min-height': ['/^(?!var\\(|100vh$|0$)/'],
      'max-height': ['/^(?!var\\(|calc\\(|none$|0$)/'],
      'min-width': ['/^(?!var\\(|100%$|0$|auto$)/'],
      'max-width': ['/^(?!var\\(|100%$|calc\\(|0$|auto$|none$)/'],
    },
    'selector-class-pattern': ['^[a-z][a-z0-9_-]*$'],
    'value-keyword-case': ['lower', { ignoreKeywords: ['Consolas', 'Menlo'] }],
  },
};
