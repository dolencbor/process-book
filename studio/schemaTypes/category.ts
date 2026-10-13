import {defineField, defineType} from 'sanity'
import {TagIcon} from '@sanity/icons/Tag'

export const category = defineType({
  name: 'category', title: 'Period Category', type: 'document', icon: TagIcon,
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'key', title: 'School period', type: 'string',
      description: 'Connects this category to its period tab.',
      options: {list: [
        {title: 'Foundation', value: 'foundation'},
        {title: 'Playgrounds S1', value: 'playgrounds-one'},
        {title: 'Personal Project', value: 'personal-project'},
        {title: 'Playgrounds S2', value: 'playgrounds-two'},
      ]},
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {select: {title: 'title'}},
})
