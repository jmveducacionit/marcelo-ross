---
name: Heritage Ledger
colors:
  surface: '#f6faff'
  surface-dim: '#d2dbe4'
  surface-bright: '#f6faff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#ecf5fe'
  surface-container: '#e6eff8'
  surface-container-high: '#e0e9f2'
  surface-container-highest: '#dbe4ed'
  on-surface: '#141d23'
  on-surface-variant: '#44474c'
  inverse-surface: '#293138'
  inverse-on-surface: '#e9f2fb'
  outline: '#74777d'
  outline-variant: '#c4c6cd'
  surface-tint: '#4f6073'
  primary: '#041627'
  on-primary: '#ffffff'
  primary-container: '#1a2b3c'
  on-primary-container: '#8192a7'
  inverse-primary: '#b7c8de'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e4e2e1'
  on-secondary-container: '#656464'
  tertiary: '#211200'
  on-tertiary: '#ffffff'
  tertiary-container: '#38260b'
  on-tertiary-container: '#a88c69'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e4fb'
  primary-fixed-dim: '#b7c8de'
  on-primary-fixed: '#0b1d2d'
  on-primary-fixed-variant: '#38485a'
  secondary-fixed: '#e4e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#474747'
  tertiary-fixed: '#feddb5'
  tertiary-fixed-dim: '#e1c29b'
  on-tertiary-fixed: '#281802'
  on-tertiary-fixed-variant: '#584326'
  background: '#f6faff'
  on-background: '#141d23'
  surface-variant: '#dbe4ed'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style
The design system embodies the "Heritage Ledger" narrative—a fusion of old-world sartorial excellence and modern retail precision. It is designed for "Marcelo Ross Hombre," a destination for high-end multi-brand menswear. The personality is authoritative yet welcoming, reflecting the meticulous nature of bespoke tailoring and the organized clarity of an artisan's ledger.

The visual style is **Corporate / Modern** with a **Minimalist** restraint. It avoids trendy gimmicks in favor of timeless proportions, generous whitespace, and high-quality typography. The goal is to evoke a sense of quiet luxury, ensuring the clothing photography remains the focal point while the UI provides a structured, high-trust environment for high-value transactions.

## Colors
The palette is rooted in traditional masculine tailoring. **Deep Navy** serves as the primary brand anchor, used for headers, primary actions, and key navigation elements to establish authority. **Warm Charcoal** provides depth for secondary text and structural borders.

**Subtle Gold/Brass** is used sparingly as an accent for high-importance highlights, such as "Limited Edition" tags, active selection states, or primary call-to-action hover effects. The **Off-white/Cream** background is critical; it softens the digital experience, mimicking the texture of premium stationery or high-quality garment labels, and reduces eye strain compared to pure white.

## Typography
The typographic scale establishes a clear hierarchy between editorial expression and functional utility. **Playfair Display** is reserved for headlines and "hero" moments, bringing a sophisticated, literary quality to the interface. 

**Inter** handles all functional UI, body copy, and data-heavy sections. Its high x-height and neutral character ensure maximum legibility for product descriptions and sizing charts. Labels use a slightly increased letter spacing and uppercase styling to mimic the aesthetic of physical garment tags and ledgers.

## Layout & Spacing
This design system utilizes a **Fixed Grid** philosophy for desktop to maintain an editorial, magazine-like feel, while transitioning to a fluid model for mobile devices. 

A strict 8px spatial scale governs all padding and margins. On desktop, a 12-column grid with 24px gutters is standard. Large sections of content should be punctuated by generous "breathing room" (64px to 96px vertical spacing) to emphasize the premium nature of the brand. For product listings, a 3 or 4-column layout is preferred to ensure imagery remains large and impactful.

## Elevation & Depth
Depth is conveyed through **Low-contrast outlines** and **Tonal layers** rather than heavy shadows. This maintains the "ledger" aesthetic—flat, organized, and precise.

- **Level 0 (Base):** Off-white (#F8F9FA) background.
- **Level 1 (Cards/Sections):** Pure white background with a 1px solid border in Warm Charcoal at 10% opacity.
- **Level 2 (Interaction):** Soft, ambient shadows (Blur: 12px, Y: 4, Opacity: 5%, Color: Deep Navy) are used only for active dropdowns or floating cart summaries to provide a hint of lift without breaking the minimalist aesthetic.

## Shapes
The shape language is "Soft Professional." A subtle 4px to 8px corner radius is applied to all buttons, input fields, and product cards. This softens the austerity of the Deep Navy and Charcoal palette, making the digital environment feel more approachable while maintaining a tailored, structured appearance. Icons should follow a consistent "Medium" stroke weight to align with the Inter typography.

## Components
- **Buttons:** Primary buttons are solid Deep Navy with white Inter text (uppercase). Secondary buttons use a Deep Navy 1px outline. The accent Gold is reserved for "Add to Cart" or unique "Bespoke Service" calls to action.
- **Input Fields:** Use a white background with a subtle Warm Charcoal border. Labels sit above the field in uppercase Inter (Label-md style).
- **Product Cards:** Minimalist styling with no external borders; use a light Tonal Layer on hover. Prices are set in Inter (Bold) while product names are set in Playfair Display.
- **Chips/Tags:** Used for "New Arrival" or "Silk Blend." These use a light-wash version of the Accent Gold with dark text to indicate premium status without being garish.
- **Lists:** Inventory and ledger-style lists use thin horizontal dividers (Warm Charcoal at 10% opacity) and alternating row subtle tints for high legibility in data-heavy views.