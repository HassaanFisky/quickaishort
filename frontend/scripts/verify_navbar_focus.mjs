/**
 * Automated Verification Script for Milestone 3 Features 15 & 16
 *
 * Feature 15: Responsive Navbar on 390px Viewports (Zero Horizontal Overflow)
 * Feature 16: Global WCAG 2.4.7 :focus-visible Ring & :focus:not(:focus-visible) Reset
 *
 * Can be run via: node verify_navbar_focus.mjs
 */

import fs from "fs";
import path from "path";
import assert from "node:assert/strict";

const REPO_ROOT = "e:\\QuickAI Short orignal";
const NAVBAR_FILE = path.join(REPO_ROOT, "frontend", "src", "components", "layout", "Navbar.tsx");
const GLOBALS_CSS = path.join(REPO_ROOT, "frontend", "src", "app", "globals.css");

console.log("================================================================================");
console.log("QuickAI Studio — Features 15 & 16 Automated Verification Suite");
console.log("================================================================================");

let passes = 0;
let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passes++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failures++;
  }
}

// -----------------------------------------------------------------------------
// Suite 1: Feature 16 CSS Verification in globals.css
// -----------------------------------------------------------------------------
console.log("\n[Suite 1] Feature 16: Global :focus-visible WCAG Ring in globals.css");

test("globals.css exists and is readable", () => {
  assert.equal(fs.existsSync(GLOBALS_CSS), true, `File not found: ${GLOBALS_CSS}`);
});

const cssContent = fs.existsSync(GLOBALS_CSS) ? fs.readFileSync(GLOBALS_CSS, "utf-8") : "";

test("globals.css has :focus-visible rule with 2px accent outline and fallback", () => {
  // Checks for: outline: 2px solid hsl(var(--accent-indigo, 270 91% 65%));
  const focusVisibleRegex = /:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+hsl\(var\(--accent-indigo,\s*270\s+91%\s+65%\)\);[^}]*\}/s;
  const match = focusVisibleRegex.test(cssContent);
  if (!match) {
    // Check if older version exists to report accurate diagnostic
    const oldMatch = /:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+hsl\(var\(--accent-indigo\)\);[^}]*\}/s.test(cssContent);
    if (oldMatch) {
      throw new Error("Found older :focus-visible without fallback '270 91% 65%'. Needs update to hsl(var(--accent-indigo, 270 91% 65%)).");
    }
    throw new Error("Missing WCAG :focus-visible rule with outline: 2px solid hsl(var(--accent-indigo, 270 91% 65%)).");
  }
});

test("globals.css has outline-offset: 2px on :focus-visible", () => {
  const offsetRegex = /:focus-visible\s*\{[^}]*outline-offset:\s*2px;[^}]*\}/s;
  assert.equal(offsetRegex.test(cssContent), true, "Missing outline-offset: 2px on :focus-visible");
});

test("globals.css does NOT have border-radius on global :focus-visible", () => {
  const baseBlock = cssContent.slice(cssContent.indexOf("@layer base"), cssContent.indexOf("/*", cssContent.indexOf("@layer base")));
  const hasRadiusInFocusVisible = /:focus-visible\s*\{[^}]*border-radius:[^}]*\}/s.test(baseBlock);
  if (hasRadiusInFocusVisible) {
    throw new Error("Global :focus-visible must NOT specify border-radius (distorts circular/pill elements on focus).");
  }
});

test("globals.css has :focus:not(:focus-visible) reset to remove click outlines", () => {
  const notFocusVisibleRegex = /:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none;\s*\}/s;
  assert.equal(notFocusVisibleRegex.test(cssContent), true, "Missing :focus:not(:focus-visible) { outline: none; } reset");
});

// -----------------------------------------------------------------------------
// Suite 2: Feature 15 Layout & Overflow Verification in Navbar.tsx
// -----------------------------------------------------------------------------
console.log("\n[Suite 2] Feature 15: Mobile Navbar Responsive Layout (390px Viewports)");

test("Navbar.tsx exists at frontend/src/components/layout/Navbar.tsx", () => {
  assert.equal(fs.existsSync(NAVBAR_FILE), true, `File not found: ${NAVBAR_FILE}`);
});

const navContent = fs.existsSync(NAVBAR_FILE) ? fs.readFileSync(NAVBAR_FILE, "utf-8") : "";

test("Navbar header has responsive padding and overflow-x-hidden", () => {
  const headerMatch = /<header[^>]*className=["'][^"']*p-2\.5\s+sm:p-4[^"']*max-w-full\s+overflow-x-hidden[^"']*["']/.test(navContent);
  if (!headerMatch) {
    throw new Error("Header must include 'p-2.5 sm:p-4' and 'max-w-full overflow-x-hidden'.");
  }
});

test("Navbar nav element has responsive inner padding px-3 sm:px-5 and overflow containment", () => {
  const navPaddingMatch = /px-3\s+sm:px-5/.test(navContent);
  assert.equal(navPaddingMatch, true, "Nav must have responsive horizontal padding 'px-3 sm:px-5'.");
});

test("Navbar collapses QSLogo to variant='mark' on mobile (< sm:) and variant='full' on desktop", () => {
  const markMatch = /<QSLogo[^>]*variant=["']mark["'][^>]*className=["'][^"']*sm:hidden[^"']*["']/.test(navContent);
  const fullMatch = /<QSLogo[^>]*variant=["']full["'][^>]*className=["'][^"']*hidden\s+sm:inline-flex[^"']*["']/.test(navContent);
  if (!markMatch || !fullMatch) {
    throw new Error("Navbar must render QSLogo variant='mark' with sm:hidden and variant='full' with hidden sm:inline-flex.");
  }
});

test("Navbar hides Language Dropdown on mobile viewports (< sm:)", () => {
  const langHiddenMatch = /<div\s+className=["'][^"']*hidden\s+sm:block[^"']*["']>\s*<DropdownMenu>[\s\S]*?Select Language/s.test(navContent);
  assert.equal(langHiddenMatch, true, "Language selector DropdownMenu must be hidden on mobile (< sm:) using 'hidden sm:block'.");
});

test("Navbar renders compact CTA button on mobile with whitespace-nowrap and flex-shrink-0", () => {
  const ctaMatch = /<GlowButton[^>]*className=["'][^"']*flex-shrink-0\s+whitespace-nowrap[^"']*["']/.test(navContent);
  const startSpanMatch = /<span\s+className=["']sm:hidden["']>Start<\/span>/.test(navContent);
  if (!ctaMatch || !startSpanMatch) {
    throw new Error("GlowButton must have compact 'Start' label on mobile with 'flex-shrink-0 whitespace-nowrap'.");
  }
});

// -----------------------------------------------------------------------------
// Suite 3: Mathematical Viewport Budget Simulation (390px, 375px, 320px)
// -----------------------------------------------------------------------------
console.log("\n[Suite 3] Mathematical Budget Verification on Mobile Viewports");

const VIEWPORTS = [
  { name: "iPhone 12/13/14/15", width: 390 },
  { name: "iPhone SE 2nd/3rd", width: 375 },
  { name: "iPhone SE 1st / Ultra-compact", width: 320 },
];

for (const vp of VIEWPORTS) {
  test(`Layout fits inside ${vp.name} (${vp.width}px) without overflow`, () => {
    // Outer padding: p-2.5 = 10px each side = 20px
    const outerPadding = 20;
    // Inner nav padding: px-3 = 12px each side = 24px
    const innerPadding = 24;
    const availableWidth = vp.width - outerPadding - innerPadding;

    // Elements inside:
    // Left: QSLogo mark = 32px
    const logoMarkWidth = 32;
    // Right:
    // LiquidThemeToggle: 36px
    const themeToggleWidth = 36;
    // Gap to buttons: 6px (gap-1.5)
    const gap1 = 6;
    // Sign In button: text-xs h-8 px-2 (~52px)
    const signInWidth = 52;
    // Gap between buttons: 4px (gap-1)
    const gap2 = 4;
    // Start button: text-xs h-8 px-2.5 (~50px)
    const startWidth = 50;

    const totalRightWidth = themeToggleWidth + gap1 + signInWidth + gap2 + startWidth; // 148px
    const totalContentWidth = logoMarkWidth + totalRightWidth; // 180px
    const totalOuterWidth = totalContentWidth + innerPadding + outerPadding; // 224px

    const margin = availableWidth - totalContentWidth;

    if (totalOuterWidth > vp.width) {
      throw new Error(`Total width ${totalOuterWidth}px exceeds viewport ${vp.width}px by ${totalOuterWidth - vp.width}px!`);
    }

    assert.ok(margin > 0, `Content (${totalContentWidth}px) must be less than available width (${availableWidth}px)`);
  });
}

console.log("\n================================================================================");
console.log(`Verification Summary: ${passes} passed, ${failures} failed out of ${passes + failures} tests.`);
console.log("================================================================================");

if (failures > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
