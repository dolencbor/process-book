import {defineArrayMember, defineField, defineType} from 'sanity'
import {DocumentTextIcon} from '@sanity/icons/DocumentText'

export const post = defineType({
  name: 'post',
  title: 'Week Post',
  type: 'document',
  icon: DocumentTextIcon,
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'weekNumber', title: 'Week number', type: 'number',
      description: 'Continuous school-year numbering across all periods (01, 02, …).',
      validation: (rule) => rule.required().integer().min(1),
    }),
    defineField({
      name: 'category', title: 'Period category',
      type: 'reference',
      to: [{type: 'category'}],
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'entryDate', title: 'Entry date', type: 'date', validation: (rule) => rule.required()}),
    defineField({
      name: 'coverImage', title: 'Card image', type: 'image', options: {hotspot: true},
      description: 'Used by the Scroll card and List preview. Set its crop and focal point here.',
      fields: [defineField({name: 'alt', title: 'Alternative text', type: 'string', validation: (rule) => rule.required()})],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'body',
      title: 'Notes and images',
      type: 'array',
      of: [
        defineArrayMember({type: 'block'}),
        defineArrayMember({
          type: 'image',
          options: {hotspot: true},
          fields: [
            defineField({name: 'alt', title: 'Alternative text', type: 'string', validation: (rule) => rule.required()}),
            defineField({name: 'caption', type: 'string'}),
          ],
        }),
      ],
    }),
  ],
  orderings: [
    {title: 'Week number', name: 'weekNumberAsc', by: [{field: 'weekNumber', direction: 'asc'}]},
    {title: 'Entry date', name: 'entryDateDesc', by: [{field: 'entryDate', direction: 'desc'}]},
  ],
  preview: {
    select: {title: 'title', weekNumber: 'weekNumber', category: 'category.title', media: 'coverImage'},
    prepare({title, weekNumber, category, media}) {
      return {title: `Week ${String(weekNumber ?? '–').padStart(2, '0')} — ${title || 'Untitled'}`, subtitle: category, media}
    },
  },
})
