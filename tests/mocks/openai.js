export function createMockEmbedding(values = [0.1, 0.2, 0.3]) {
  return {
    data: [
      {
        embedding: values,
        index: 0,
      },
    ],
  };
}

export function createMockChatCompletion(content) {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}
