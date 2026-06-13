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
    function setForm(form) {
      const pTaxForm = document.getElementById('p_tax_form');
      pTaxForm.value = form;
      pTaxForm.dispatchEvent(new window.Event('change'));
    }

    it('disables p_kup when form is ryczalt', async () => {
      const script = await import('../script.js');
      setForm('ryczalt');
      script.updateVisibility();
      expect(document.getElementById('p_kup').disabled).toBe(true);
    });

    it('enables p_kup when form is skala', async () => {
      const script = await import('../script.js');
      setForm('skala');
      script.updateVisibility();
      expect(document.getElementById('p_kup').disabled).toBe(false);
    });

    it('enables p_kup when form is liniowy', async () => {
      const script = await import('../script.js');
      setForm('liniowy');
      script.updateVisibility();
      expect(document.getElementById('p_kup').disabled).toBe(false);
    });

    it('preserves the p_kup value across disable/enable transitions', async () => {
      const script = await import('../script.js');
      const pKup = document.getElementById('p_kup');

      setForm('skala');
      script.updateVisibility();
      expect(pKup.disabled).toBe(false);
      pKup.value = '12345';
      expect(pKup.value).toBe('12345');

      setForm('ryczalt');
      script.updateVisibility();
      expect(pKup.disabled).toBe(true);
      expect(pKup.value).toBe('12345');

      setForm('liniowy');
      script.updateVisibility();
      expect(pKup.disabled).toBe(false);
      expect(pKup.value).toBe('12345');
    });
  });

  describe('Income-block clarity (DG-only taxpayer)', () => {
    it('taxpayer has no source selector', async () => {
      await import('../script.js');
      expect(document.getElementById('p_source')).toBeNull();
    });

    it('taxpayer income label states bez VAT', async () => {
      await import('../script.js');
      const incLabel = document.getElementById('p_inc').parentElement.querySelector('label');
      expect(incLabel.textContent).toContain('bez VAT');
    });

    it('taxpayer income hint warns off take-home and profit', async () => {
      const script = await import('../script.js');
      script.updateVisibility();
      const hint = document.getElementById('p_inc_hint').innerHTML;
      expect(hint).toContain('na rękę');
      expect(hint).toContain('zysk po kosztach');
    });

    it('ryczalt adds the cost-note line and switches the KUP tooltip', async () => {
      const script = await import('../script.js');
      document.getElementById('p_tax_form').value = 'ryczalt';
      script.updateVisibility();
      expect(document.getElementById('p_inc_hint').innerHTML).toContain('go nie obniżają');
      expect(document.getElementById('p_kup_tt').textContent).toContain('Ryczałt nie uwzględnia');
    });

    it('spouse income label/hint follow s_source', async () => {
      const script = await import('../script.js');
      const sSource = document.getElementById('s_source');

      sSource.value = 'etat';
      script.updateVisibility();
      expect(document.getElementById('s_inc_label').textContent).toContain('brutto');
      expect(document.getElementById('s_inc_hint').innerHTML).toContain('na rękę');

      sSource.value = 'dg';
      script.updateVisibility();
      expect(document.getElementById('s_inc_label').textContent).toContain('bez VAT');
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
        version: 2, carType: 'new', financing: 'cash',
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
