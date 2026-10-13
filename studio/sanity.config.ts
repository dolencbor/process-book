import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'Process Book',

  projectId: '6ny2t94o',
  dataset: 'production',

  plugins: [structureTool({
    structure: (S) => S.list().title('Process Book').items([
      S.documentTypeListItem('post').title('Week Posts').child(
        S.documentTypeList('post').title('Week Posts').defaultOrdering([{field: 'weekNumber', direction: 'asc'}]),
      ),
      S.documentTypeListItem('category').title('Period Categories'),
    ]),
  }), visionTool()],

  schema: {
    types: schemaTypes,
  },
})
