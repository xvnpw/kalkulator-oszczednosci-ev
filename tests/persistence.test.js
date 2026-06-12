// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Form configuration persistence', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();

    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const htmlString = fs.readFileSync(htmlPath, 'utf-8')
      .replace(/<link[^>]*stylesheet[^>]*>/gi, '')
      .replace(/<link[^>]*preconnect[^>]*>/gi, '');
    document.documentElement.innerHTML = htmlString;
  });

  it('exports EV_CONFIG_KEY and EV_CONFIG_VERSION', async () => {
    const script = await import('../script.js');
    expect(script.EV_CONFIG_KEY).toBe('ev-config');
    expect(script.EV_CONFIG_VERSION).toBe(1);
  });

  it('saveConfig writes version, values, checks, carType, financing to localStorage', async () => {
    const script = await import('../script.js');

    document.getElementById('p_inc').value = '250000';
    document.getElementById('joint_filing').checked = true;

    script.saveConfig();

    const raw = localStorage.getItem(script.EV_CONFIG_KEY);
    expect(raw).not.toBeNull();
    const cfg = JSON.parse(raw);
    expect(cfg.version).toBe(script.EV_CONFIG_VERSION);
    expect(cfg.values.p_inc).toBe('250000');
    expect(cfg.checks.joint_filing).toBe(true);
    expect(cfg.carType).toBe('new');
    expect(cfg.financing).toBe('cash');
  });

  it('saveConfig is called automatically by calc()', async () => {
    const script = await import('../script.js');
    localStorage.removeItem(script.EV_CONFIG_KEY);

    document.getElementById('km').value = '99999';
    window.calc();

    const raw = localStorage.getItem(script.EV_CONFIG_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw).values.km).toBe('99999');
  });

  it('restoreConfig repopulates value and checkbox fields from saved config', async () => {
    localStorage.setItem('ev-config', JSON.stringify({
      version: 1,
      carType: 'new',
      financing: 'cash',
      values: { p_inc: '333333', km: '20000' },
      checks: { joint_filing: true }
    }));

    await import('../script.js');

    expect(document.getElementById('p_inc').value).toBe('333333');
    expect(document.getElementById('km').value).toBe('20000');
    expect(document.getElementById('joint_filing').checked).toBe(true);
  });

  it('restoreConfig is a no-op when no config is saved (HTML defaults remain)', async () => {
    await import('../script.js');
    expect(document.getElementById('p_inc').value).toBe('200000');
  });

  it('restoreConfig ignores saved config with mismatched version', async () => {
    localStorage.setItem('ev-config', JSON.stringify({
      version: 999,
      carType: 'used',
      financing: 'leasing',
      values: { p_inc: '999999' },
      checks: {}
    }));

    await import('../script.js');

    expect(document.getElementById('p_inc').value).toBe('200000');
  });

  it('restoreConfig does not throw on malformed JSON', async () => {
    localStorage.setItem('ev-config', 'not-json{{{');

    await expect(import('../script.js')).resolves.toBeDefined();
    expect(document.getElementById('p_inc').value).toBe('200000');
  });

  it('restoreConfig skips unknown field ids without throwing', async () => {
    localStorage.setItem('ev-config', JSON.stringify({
      version: 1,
      carType: 'new',
      financing: 'cash',
      values: { p_inc: '210000', nonexistent_field: 'abc' },
      checks: {}
    }));

    await expect(import('../script.js')).resolves.toBeDefined();
    expect(document.getElementById('p_inc').value).toBe('210000');
  });

  it('restoreConfig restores carType=used and financing=leasing including UI state', async () => {
    localStorage.setItem('ev-config', JSON.stringify({
      version: 1,
      carType: 'used',
      financing: 'leasing',
      values: {},
      checks: {}
    }));

    await import('../script.js');

    expect(document.getElementById('used_vat_row').style.display).toBe('block');
    expect(document.getElementById('tc_leasing').classList.contains('on')).toBe(true);
    expect(document.getElementById('tc_cash').classList.contains('on')).toBe(false);
  });

  it('round trip: saveConfig then restoreConfig restores changed values', async () => {
    const script = await import('../script.js');

    document.getElementById('p_inc').value = '777777';
    document.getElementById('km').value = '12345';
    document.getElementById('joint_filing').checked = true;
    script.saveConfig();

    // Simulate a fresh page load by resetting fields to defaults
    document.getElementById('p_inc').value = '200000';
    document.getElementById('km').value = '15000';
    document.getElementById('joint_filing').checked = false;

    script.restoreConfig();

    expect(document.getElementById('p_inc').value).toBe('777777');
    expect(document.getElementById('km').value).toBe('12345');
    expect(document.getElementById('joint_filing').checked).toBe(true);
  });

  it('reset button clears saved config and reloads the page', async () => {
    const script = await import('../script.js');
    localStorage.setItem(script.EV_CONFIG_KEY, JSON.stringify({
      version: 1, carType: 'new', financing: 'cash', values: {}, checks: {}
    }));

    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {});

    document.getElementById('reset_config').click();

    expect(localStorage.getItem(script.EV_CONFIG_KEY)).toBeNull();
    expect(reloadSpy).toHaveBeenCalled();

    reloadSpy.mockRestore();
  });
});
