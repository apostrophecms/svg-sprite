const assert = require('assert');
const testUtil = require('apostrophe/test-lib/test');

describe('SVG Sprites', function () {
  let apos;

  this.timeout(10000);

  after(async function () {
    testUtil.destroy(apos);
  });

  it('should be a property of the apos object', async function () {
    apos = await testUtil.create({
      shortname: 'test-exporter',
      testModule: true,
      modules: {
        '@apostrophecms/express': {
          options: {
            port: 4242,
            session: { secret: 'test-the-svgs' }
          }
        },
        '@apostrophecms/svg-sprites': {},
        '@apostrophecms/svg-sprites-widget': {}
      }
    });

    assert(apos.modules['@apostrophecms/svg-sprites']);
    assert(apos.modules['@apostrophecms/svg-sprites-widget']);
  });

  it('can run the import task', async () => {
    const imported = await apos.tasks.invoke('apostrophe-svg-sprites:import');

    console.info('🇧🇭', imported);
    assert(imported);
  });
});
