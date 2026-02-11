import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Start Here',
      items: ['start-here/docker-quick-start', 'start-here/vercel-deployment', 'start-here/local-development'],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/environment-variables',
        'reference/stack',
      ],
    },
    {
      type: 'category',
      label: 'Configure',
      items: [
        'configure/tts-providers',
        {
          type: 'doc',
          id: 'configure/configuration',
          label: 'Auth (Reccomended)',
        },
        'configure/tts-rate-limiting',
        'configure/database-and-migrations',
        'configure/storage-and-blob-behavior',
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
      items: ['project/support', 'project/acknowledgements', 'project/license'],
    },
  ],
};

export default sidebars;
