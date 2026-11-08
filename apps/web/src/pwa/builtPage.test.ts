import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { inlineScriptHashes, optOutOfRocketLoader } from './builtPage';

describe('optOutOfRocketLoader', () => {
  it('marks every script, inline or not, so Rocket Loader leaves it alone', () => {
    const html =
      '<script>a()</script><script type="module" crossorigin src="/assets/i.js"></script><script src="/boot.js" async></script>';
    expect(optOutOfRocketLoader(html)).toBe(
      '<script data-cfasync="false">a()</script>' +
        '<script data-cfasync="false" type="module" crossorigin src="/assets/i.js"></script>' +
        '<script data-cfasync="false" src="/boot.js" async></script>'
    );
  });

  it('leaves a script that already says, and other tags, as they are', () => {
    const html = '<script data-cfasync="true">x</script><noscript>n</noscript><scripted>';
    expect(optOutOfRocketLoader(html)).toBe(html);
  });
});

describe('inlineScriptHashes', () => {
  const sha = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;

  it('hashes the content of each inline script, whatever its attributes, and skips scripts with a src', () => {
    const html =
      '<script data-cfasync="false">\n  run();\n</script><script data-cfasync="false" src="/boot.js"></script><script>b()</script>';
    expect(inlineScriptHashes(html)).toEqual([sha('\n  run();\n'), sha('b()')]);
  });
});
