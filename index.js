const fs = require('fs');
const glob = require('glob');
const axios = require('axios');
const xml2js = require('xml2js');
const path = require('path');
const _ = require('lodash');

module.exports = {
  extend: '@apostrophecms/piece-type',
  bundle: {
    directory: 'modules',
    modules: getBundleModuleNames()
  },
  options: {
    label: 'aposSvgs:label',
    pluralLabel: 'aposSvgs:pluralLabel',
    i18n: {
      ns: 'aposSvgs',
      browser: true
    },
    // Opt out of open graph, SEO, search, and quick create
    openGraph: false,
    seo: false,
    searchable: false,
    quickCreate: false,
    // Auto-publish (no draft state)
    autopublish: true
  },
  tasks (self) {
    return {
      import: {
        usage: 'aposSvgs:taskUsage',
        async task () {
          const maps = self.options.maps;
          const req = self.apos.task.getReq();
          const readFile = require('util').promisify(fs.readFile);
          const parseString = require('util').promisify(xml2js.parseString);

          for (const map of maps) {
            console.info('🍁', map);
            const { data, updatedMap } = await loadMap(map);

            const svgs = await parseMap(data, updatedMap);

            await evaluateForUpsert(svgs);
          }

          async function loadMap(map) {
            const pattern = /(http(s)?)/gi;

            if (pattern.test(map.file)) {
              // file is a full url, load it via `request` module
              const response = await axios.get(map.file);
              console.info('0️⃣', response);
              if (!response.ok) {
                // TODO: Check for 400 error
                // this ain't the way to get the error code.
                throw new Error(response);
              }

              const data = response.body;

              return {
                data,
                map
              };

            } else {
              const base = `${self.apos.rootDir}/modules/@apostrophecms/svg-sprites/public/`;
              const path = base + map.file;

              if (path.includes('*')) {
                const files = glob(path).sync();

                if (files.length) {
                  const data = await readFile(files[0]);

                  // Get the path relative to the module's public folder
                  const file = files[0].substring(base.length);
                  // Correct map.file to point to the current actual file,
                  map.file = file;

                  // TODO: A3 doesn't have assetUrl server-side. Confirm this.
                  map.finalFile = self.apos.prefix + '/modules/@apostrophecms/my-svg-sprites/' + file;

                  return {
                    data,
                    map
                  };

                } else {
                  self.apos.util.error(path + ' does not match anything, cannot continue');
                  return {
                    data: null,
                    map
                  };
                }

              } else {
                if (fileExists(path)) {
                  // TODO: A3 doesn't have assetUrl server-side. Confirm this.
                  map.finalFile = self.apos.prefix + '/modules/@apostrophecms/my-svg-sprites/' + map.file;

                  const data = await readFile(path);

                  return {
                    data,
                    map
                  };

                } else {
                  self.apos.util.error(path + ': no path provided, cannot continue');
                  return {
                    data: null,
                    map
                  };
                }
              }
            }
          }

          async function parseMap(xml = '', map = {}) {
            const svgs = [];
            console.info('🇲🇽', xml);
            const result = await parseString(xml);

            let symbols = findInObj(result, 'symbol');

            if (!symbols.length) {
              self.apos.util.error('Could not find an array of <symbol> elements in map ' + map.label);

              throw self.apos.error('invalid');
            }

            if (symbols[0] && symbols[0].symbol) {
              symbols = symbols[0].symbol;
            } else {
              self.apos.util.error('Error occurred parsing array of symbols in map ' + map.label);

              throw self.apos.error('error');
            }

            symbols.forEach(function (symbol) {
              if (symbol.$.id) {
                svgs.push({
                  symbol: symbol.$,
                  file: map.finalFile,
                  map: map.name
                });
              } else {
                self.apos.util.error('SVG is malformed or has no ID property');

                throw self.apos.error('invalid');
              }
            });

            return svgs;

          }

          async function evaluateForUpsert(svgs) {
            for (const svg of svgs) {
              const docs = await self.find(req, {
                id: svg.symbol.id
              }, {}).toArray();

              if (docs.length) {
                // i have a doc, update it
                await updatePiece(docs[0], svg);
              } else {
                // i don't have a doc, insert it
                await insertPiece(svg);
              }
            }
          }

          async function insertPiece(svg) {
            const piece = self.newInstance();

            if (svg.symbol.title) {
              piece.title = self.apos.launder.string(svg.symbol.title);
            } else {
              piece.title = self.apos.launder.string(svg.symbol.id);
            }

            piece.svgId = svg.symbol.id;
            piece.file = svg.file;
            piece.map = svg.map;

            await self.insert(req, piece, {
              permissions: false
            });
          }

          async function updatePiece(doc, svg, callback) {
            const updateFields = {};

            if (svg.symbol.title) {
              updateFields.title = self.apos.launder.string(svg.symbol.title);
            } else {
              updateFields.title = self.apos.launder.string(svg.symbol.id);
            }

            updateFields.file = svg.file;
            updateFields.map = svg.map;

            await self.apos.doc.db.updateOne({
              _id: doc._id
            }, {
              $set: updateFields
            });
          }

          function fileExists(path) {
            if (fs.existsSync(path)) {
              return true;
            } else {
              return false;
            }
          }

          function findInObj(obj, key) {

            if (_.has(obj, key)) {
              return [ obj ];
            }
            // TODO: replace lodash? or use flatMap?
            return _.flatten(_.map(obj, function (v) {
              return typeof v === 'object' ? findInObj(v, key) : [];
            }), true);
          }
        }
      }
    };
  }
};

function getBundleModuleNames() {
  const source = path.join(__dirname, './modules/@apostrophecms');
  return fs
    .readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => `@apostrophecms/${dirent.name}`);
}
