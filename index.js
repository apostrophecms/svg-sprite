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
  fields (self) {
    const mapChoices = (self.options.maps || []).map(map => {
      return {
        label: map.label,
        value: map.name
      };
    });

    return {
      add: {
        svgId: {
          label: 'ID',
          type: 'string',
          help: 'ID of the <symbol> element in the map',
          required: true
        },
        map: {
          label: 'Map',
          type: 'select',
          choices: mapChoices,
          required: true,
          readOnly: true
        }
      },
      group: {
        basics: {
          fields: [ 'svgId', 'map' ]
        }
      }
    };
  },
  tasks (self) {
    const {
      importTask
    } = require('./lib/import')(self);

    return {
      import: {
        usage: 'aposSvgs:taskUsage',
        task: importTask
      }
    };
  }
};
