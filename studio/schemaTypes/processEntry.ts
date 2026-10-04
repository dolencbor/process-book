import {defineArrayMember, defineField, defineType} from 'sanity'

export const processEntry = defineType({
  name: 'processEntry',
  title: 'Process Entry',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'project',
      type: 'reference',
      to: [{type: 'project'}],
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'entryDate', title: 'Entry date', type: 'date', validation: (rule) => rule.required()}),
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
  orderings: [{title: 'Entry date', name: 'entryDateDesc', by: [{field: 'entryDate', direction: 'desc'}]}],
  preview: {select: {title: 'title', subtitle: 'project.title'}},
})
