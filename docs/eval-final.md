# Cortex RAG Eval Baseline

Generated: 2026-06-23T11:24:44.840Z
Started: 2026-06-23T11:24:42.165Z
User ID: `1`
Top K: 8

## Summary

- Questions: 20
- Recall@8: 0.000
- Precision@8: 0.000
- MRR: 0.000
- Answer correctness: 0.000
- Errors: 20

## Blocker

OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.

## Rows

| ID | Recall | Precision | MRR | Answer | Error |
|---|---:|---:|---:|---:|---|
| exact-case-reference | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| active-cases | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| high-priority | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| party-contact | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| defendant-address | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| next-hearing | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| fraud-cases | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| contract-documents | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| evidence-documents | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| court-orders | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| recent-cases | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| assigned-lawyer | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| civil-cases-with-documents | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| case-party-role | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| public-prosecutor-memo | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| document-by-tag | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| arabic-active-cases | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| arabic-case-number | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| arabic-documents-fraud | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |
| follow-up-context | 0.000 | 0.000 | 0.000 | 0.000 | OpenAI preflight failed (insufficient_quota): You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors. |

## Notes

- This report exercises the current chat pipeline and records the retrieval backend state at the time of the run.
- Answer correctness currently uses a deterministic rubric-term heuristic so the eval runner itself does not add extra LLM calls. Retrieval still goes through the live chat pipeline.
- Generic expected IDs in the golden set are intentionally document/case-level labels, not chunk IDs, so the set survives future re-chunking.
