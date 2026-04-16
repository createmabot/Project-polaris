import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('App route definitions', () => {
  it('keeps Home route at / and walkthrough alias at /home', () => {
    const appSource = readFileSync(resolve(__dirname, 'App.tsx'), 'utf-8');
    expect(appSource).toContain('<Route path="/" component={Home} />');
    expect(appSource).toContain('<Route path="/home" component={Home} />');
  });
});

