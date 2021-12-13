const fs = require('fs');
const glob = require('glob');
const { default: fetch } = require('node-fetch');
const xml2js = require('xml2js');
const path = require('path');

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
          const req = self.apos.tasks.getReq();
          const readFile = require('util').promisify(fs.readFile);
          const parseString = require('util').promisify(xml2js.parseString);

          for (const map of maps) {
            const { data, updatedMap } = await loadMap(map);

            const svgs = await parseMap(data, updatedMap);

            evaluateForUpsert(svgs);
          }

          // async.eachSeries(maps, function (map, callback) {
          //   return async.waterfall([
          //     async.apply(loadMap, map),
          //     parseMap,
          //     evaluateForUpsert
          //   ], callback);
          // }, callback);

          return 'TODO';

          async function loadMap(map) {
            const pattern = /(http(s)?)/gi;

            if (pattern.test(map.file)) {
              // file is a full url, load it via `request` module
              const response = await fetch(map.file);
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

                  // TODO: I don't think we have assetUrl like this anymore.
                  map.finalFile = self.apos.asset.assetUrl('/modules/my-apostrophe-svg-sprites/' + file);

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
                  // TODO: I don't think we have assetUrl like this anymore.
                  map.finalFile = self.apos.asset.assetUrl('/modules/my-apostrophe-svg-sprites/' + map.file);

                  const data = readFile(path);

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

          async function parseMap(xml, map) {

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
          // 👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇
          // TODO: Continue updating from here.
          function insertPiece(svg, callback) {
            const piece = self.newInstance();

            if (svg.symbol.title) {
              piece.title = apos.launder.string(svg.symbol.title);
            } else {
              piece.title = apos.launder.string(svg.symbol.id);
            }

            piece.id = svg.symbol.id;
            piece.file = svg.file;
            piece.map = svg.map;

            return self.insert(req, piece, {
              permissions: false
            }, callback);

          }

          function updatePiece(doc, svg, callback) {
            const updateFields = {};

            if (svg.symbol.title) {
              updateFields.title = apos.launder.string(svg.symbol.title);
            } else {
              updateFields.title = apos.launder.string(svg.symbol.id);
            }

            updateFields.file = svg.file;
            updateFields.map = svg.map;

            return apos.docs.db.update({
              _id: doc._id
            }, {
              $set: updateFields
            }, callback);
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
