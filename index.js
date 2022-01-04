const fs = require('fs');
const glob = require('glob');
const axios = require('axios');
const xml2js = require('xml2js');
const _ = require('lodash');

module.exports = {
  extend: '@apostrophecms/piece-type',
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
            const { data, updatedMap } = await loadMap(map);

            const svgs = await parseMap(data, updatedMap);

            await evaluateForUpsert(svgs);
          }

          async function loadMap(map) {
            const pattern = /(http(s)?)/gi;

            if (pattern.test(map.file)) {
              // file is a full url, load it via axios module
              const response = await axios.get(map.file);

              if (response.status >= 400 && response.status < 500) {
                throw self.apos.error('notfound');
              } else if (response.status !== 200) {
                self.apos.util.error(response);
                throw self.apos.error('error');
              }

              const data = response.data;

              return {
                data,
                map
              };

            } else {
              // file is a relative file path
              const base = `${self.apos.rootDir}/modules/@apostrophecms/svg-sprite/public/`;
              const path = base + map.file;

              if (path.includes('*')) {
                // TODO: Test this path
                const files = glob(path).sync();

                if (files.length) {
                  const data = await readFile(files[0]);

                  // Get the path relative to the module's public folder
                  const file = files[0].substring(base.length);
                  // Correct map.file to point to the current actual file,
                  map.file = file;

                  // TODO: A3 doesn't have assetUrl server-side. Confirm this.
                  map.finalFile = self.apos.prefix + '/modules/@apostrophecms/my-svg-sprite/' + file;

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
                  map.finalFile = self.apos.prefix + '/modules/@apostrophecms/my-svg-sprite/' + map.file;

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
                svgId: svg.symbol.id
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
