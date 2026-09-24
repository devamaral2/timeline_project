from huggingface_hub import snapshot_download
from engine import MODEL_REPOSITORY, MODEL_REVISION

snapshot_download(repo_id=MODEL_REPOSITORY, revision=MODEL_REVISION,
                  local_dir="/models/large-v3",
                  allow_patterns=["config.json", "model.bin", "tokenizer.json", "preprocessor_config.json", "vocabulary.*"])
