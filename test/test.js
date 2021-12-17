const assert = require('assert');
const testUtil = require('apostrophe/test-lib/test');

describe('SVG Sprites', function () {
  let apos;
  let svgSprites;

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
        '@apostrophecms/svg-sprite': {
          options: {
            maps: [
              {
                label: 'Places Icons',
                name: 'places',
                file: 'svg/places.svg'
              }
            ]
          }
        },
        '@apostrophecms/svg-sprite-widget': {}
      }
    });

    assert(apos.modules['@apostrophecms/svg-sprite']);
    svgSprites = apos.modules['@apostrophecms/svg-sprite'];
    console.info('*️⃣', svgSprites.__meta.name);
    assert(apos.modules['@apostrophecms/svg-sprite-widget']);
  });

  it('can run the import task', async () => {
    try {
      await apos.task.invoke('@apostrophecms/svg-sprite:import');
    } catch (error) {
      assert(!error);
    }
  });

  let howMany;

  it('can find imported pieces', async function() {
    const req = apos.task.getReq();

    const pieces = await svgSprites.find(req, {})
      .toArray();

    assert(pieces);
    assert(pieces.length);
    howMany = pieces.length;
    console.info('#️⃣', howMany);
  });

  it('marks existing sprites', async function() {
    try {
      await apos.doc.db.updateMany({ type: '@apostrophecms/svg-sprite' }, {
        $set: {
          existing: true
        }
      });
    } catch (error) {
      assert(!error);
    }
  });

  it('can re-import', async function() {
    try {
      await apos.task.invoke('@apostrophecms/svg-sprite:import');
    } catch (error) {
      assert(!error);
    }
  });

});
