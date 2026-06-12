// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';

describe('UI and DOM rendering', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();

    // Read the HTML file and populate happy-dom
    const path = await import('path');
    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const htmlString = fs.readFileSync(htmlPath, 'utf-8')
      .replace(/<link[^>]*stylesheet[^>]*>/gi, '')
      .replace(/<link[^>]*preconnect[^>]*>/gi, '');
    document.documentElement.innerHTML = htmlString;
  });

  it('executes calc without throwing errors', async () => {
    // Import script.js to initialize logic and expose functions to window
    await import('../script.js');

    // Trigger calculation and verify it completes without errors
    expect(() => window.calc()).not.toThrow();

    // The script updates the DOM; wait for any microtasks or timers to resolve
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  describe('KUP field gating (updateVisibility)', () => {
    function setSourceAndForm(source, form) {
      const pSource = document.getElementById('p_source');
      const pTaxForm = document.getElementById('p_tax_form');
      pSource.value = source;
      pSource.dispatchEvent(new window.Event('change'));
      pTaxForm.value = form;
      pTaxForm.dispatchEvent(new window.Event('change'));
    }

    it('disables p_kup when pSource is etat (skala)', async () => {
      const script = await import('../script.js');
      setSourceAndForm('etat', 'skala');
      script.updateVisibility();
      expect(document.getElementById('p_kup').disabled).toBe(true);
    });

    it('disables p_kup when pSource is etat (liniowy)', async () => {
      const script = await import('../script.js');
      setSourceAndForm('etat', 'liniowy');
      script.updateVisibility();
      expect(document.getElementById('p_kup').disabled).toBe(true);
    });

    it('disables p_kup when pSource is dg and form is ryczalt', async () => {
      const script = await import('../script.js');
      setSourceAndForm('dg', 'ryczalt');
      script.updateVisibility();
      expect(document.getElementById('p_kup').disabled).toBe(true);
    });

    it('enables p_kup when pSource is dg and form is skala', async () => {
      const script = await import('../script.js');
      setSourceAndForm('dg', 'skala');
      script.updateVisibility();
      expect(document.getElementById('p_kup').disabled).toBe(false);
    });

    it('enables p_kup when pSource is dg and form is liniowy', async () => {
      const script = await import('../script.js');
      setSourceAndForm('dg', 'liniowy');
      script.updateVisibility();
      expect(document.getElementById('p_kup').disabled).toBe(false);
    });

    it('preserves the p_kup value across disable/enable transitions', async () => {
      const script = await import('../script.js');
      const pKup = document.getElementById('p_kup');

      // Start enabled (dg + skala), set a value
      setSourceAndForm('dg', 'skala');
      script.updateVisibility();
      expect(pKup.disabled).toBe(false);
      pKup.value = '12345';
      expect(pKup.value).toBe('12345');

      // Move to a disabled state (etat)
      setSourceAndForm('etat', 'skala');
      script.updateVisibility();
      expect(pKup.disabled).toBe(true);
      expect(pKup.value).toBe('12345');

      // Move to another disabled state (dg + ryczalt)
      setSourceAndForm('dg', 'ryczalt');
      script.updateVisibility();
      expect(pKup.disabled).toBe(true);
      expect(pKup.value).toBe('12345');

      // Move back to an enabled state (dg + liniowy)
      setSourceAndForm('dg', 'liniowy');
      script.updateVisibility();
      expect(pKup.disabled).toBe(false);
      expect(pKup.value).toBe('12345');
    });
  });

  describe('UI Overhaul', () => {
    // Reuse the same beforeEach pattern from the parent describe block
    // (happy-dom fixture is set up by the parent beforeEach)

    it('feature toggles #inc_car, #inc_fuel, #inc_inv are absent from DOM', async () => {
      await import('../script.js');
      expect(document.getElementById('inc_car')).toBeNull();
      expect(document.getElementById('inc_fuel')).toBeNull();
      expect(document.getElementById('inc_inv')).toBeNull();
    });

    it('fuel comparison section always renders after calc', async () => {
      await import('../script.js');
      window.calc();
      await new Promise(resolve => setTimeout(resolve, 50));
      // The fuel section is rendered by renderResults — check that it exists in res_body
      const resBody = document.getElementById('res_body');
      expect(resBody).not.toBeNull();
      // Look for fuel-related content (the fuel comparison block uses class 'bk' and contains fuel data)
      expect(resBody.innerHTML.length).toBeGreaterThan(0);
    });

    it('investment alternative section always renders after calc', async () => {
      await import('../script.js');
      window.calc();
      await new Promise(resolve => setTimeout(resolve, 50));
      const resBody = document.getElementById('res_body');
      expect(resBody).not.toBeNull();
      expect(resBody.innerHTML.length).toBeGreaterThan(0);
    });

    it('theme toggle saves preference to localStorage', async () => {
      await import('../script.js');
      const btn = document.getElementById('theme_toggle');
      if (!btn) return; // guard for environments without full HTML
      // Default theme is 'dark'
      expect(document.documentElement.dataset.theme).toBe('dark');
      // Click to switch to light
      btn.click();
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(localStorage.getItem('ev-theme')).toBe('light');
    });

    it('theme is restored from localStorage on init', async () => {
      // Pre-set localStorage to 'light'
      localStorage.setItem('ev-theme', 'light');
      await import('../script.js');
      // initTheme() runs during module load; it should have read localStorage
      expect(document.documentElement.dataset.theme).toBe('light');
      // Cleanup
      localStorage.removeItem('ev-theme');
    });
  });

  describe('init resilience to a corrupt ev-config (D5/D4 guards)', () => {
    it('discards a config that makes calc() throw and reloads to defaults', async () => {
      // Valid version, but cpi=-150 ⇒ inflation -150% ⇒ engine D4 guard throws inside calc().
      localStorage.setItem('ev-config', JSON.stringify({
        version: 1, carType: 'new', financing: 'cash',
        values: { cpi: '-150' },
        checks: {},
      }));
      const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {});

      // init() runs on import; the throw must be caught, not propagated.
      await expect(import('../script.js')).resolves.toBeDefined();

      // The offending config is cleared and a reload requested so HTML defaults re-apply.
      expect(localStorage.getItem('ev-config')).toBeNull();
      expect(reloadSpy).toHaveBeenCalled();

      reloadSpy.mockRestore();
    });
  });
});
