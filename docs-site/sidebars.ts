import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Start Here',
      items: ['getting-started/docker-quick-start', 'getting-started/local-development'],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'guides/environment-variables',
        'reference/stack',
      ],
    },
    {
      type: 'category',
      label: 'Configure',
      items: [
        'guides/tts-providers',
        {
          type: 'doc',
          id: 'guides/configuration',
          label: 'Auth (Reccomended)',
        },
        'guides/tts-rate-limiting',
        'operations/database-and-migrations',
        'guides/storage-and-blob-behavior',
      ],
    },
    {
      type: 'category',
      label: 'Integrations',
      items: [
        'integrations/kokoro-fastapi',
        'integrations/orpheus-fastapi',
        'integrations/deepinfra',
        'integrations/openai',
        'integrations/custom-openai',
      ],
    },
    {
      type: 'category',
      label: 'Project',
      items: ['community/support', 'community/acknowledgements', 'community/license'],
    },
  ],
};

export default sidebars;
