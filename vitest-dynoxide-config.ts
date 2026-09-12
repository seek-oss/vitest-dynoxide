import { defineConfig } from 'vitest-dynoxide';

export default defineConfig({
  tables: [
    {
      TableName: 'TestTableCatalogue',
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: 'NEW_AND_OLD_IMAGES',
      },
    },
  ],
});
