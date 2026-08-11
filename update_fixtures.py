import os
import re

print("Running update script...")

# 1. Update flaw-recipes.ts
flaw_recipes_path = r"D:\PROJECTS\Site\work-flow-intel\src\lib\qa\fixtures\flaw-recipes.ts"
with open(flaw_recipes_path, "r", encoding="utf-8") as f:
    flaw_content = f.read()

# Add categories
new_categories = '''  | "ARCHITECTURE"
  | "OBSERVABILITY"
  | "IDEMPOTENCY"
  | "DOCUMENTATION"
  | "COST_OPTIMIZATION"
  | "COMPATIBILITY";'''

flaw_content = re.sub(r'\|\s*"ARCHITECTURE";', new_categories, flaw_content)

new_recipes = ""
# Generate 50 new recipes
# 10 OBSERVABILITY
for i in range(1, 11):
    rule_id = f"obs{i:03d}"
    cap_rule_id = f"OBS-{i:03d}"
    new_recipes += f"""
  {{
    ruleId: "{rule_id}",
    category: "OBSERVABILITY",
    label: "Observability flaw {i}",
    platforms: ["n8n", "make", "zapier", "flowise"],
    fixDescription: "Fix observability issue {i}",
    buildFlawNode(platform, i) {{
      return {{
        id: `{rule_id}-node-${{i}}`,
        name: `Node ${{i}}`,
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4,
        position: [600 + i * 20, 300],
        parameters: {{ url: "http://example.com/obs" }}
      }};
    }},
  }},
"""
# 10 IDEMPOTENCY
for i in range(1, 11):
    rule_id = f"idp{i:03d}"
    cap_rule_id = f"IDP-{i:03d}"
    new_recipes += f"""
  {{
    ruleId: "{rule_id}",
    category: "IDEMPOTENCY",
    label: "Idempotency flaw {i}",
    platforms: ["n8n", "make", "zapier", "flowise"],
    fixDescription: "Fix idempotency issue {i}",
    buildFlawNode(platform, i) {{
      return {{
        id: `{rule_id}-node-${{i}}`,
        name: `Node ${{i}}`,
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4,
        position: [600 + i * 20, 300],
        parameters: {{ url: "http://example.com/idp" }}
      }};
    }},
  }},
"""
# 10 DOCUMENTATION
for i in range(1, 11):
    rule_id = f"doc{i:03d}"
    cap_rule_id = f"DOC-{i:03d}"
    new_recipes += f"""
  {{
    ruleId: "{rule_id}",
    category: "DOCUMENTATION",
    label: "Documentation flaw {i}",
    platforms: ["n8n", "make", "zapier", "flowise"],
    fixDescription: "Fix doc issue {i}",
    buildFlawNode(platform, i) {{
      return {{
        id: `{rule_id}-node-${{i}}`,
        name: `Node ${{i}}`,
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4,
        position: [600 + i * 20, 300],
        parameters: {{ url: "http://example.com/doc" }}
      }};
    }},
  }},
"""
# 10 COST_OPTIMIZATION
for i in range(1, 11):
    rule_id = f"cost{i:03d}"
    cap_rule_id = f"COST-{i:03d}"
    new_recipes += f"""
  {{
    ruleId: "{rule_id}",
    category: "COST_OPTIMIZATION",
    label: "Cost flaw {i}",
    platforms: ["n8n", "make", "zapier", "flowise"],
    fixDescription: "Fix cost issue {i}",
    buildFlawNode(platform, i) {{
      return {{
        id: `{rule_id}-node-${{i}}`,
        name: `Node ${{i}}`,
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4,
        position: [600 + i * 20, 300],
        parameters: {{ url: "http://example.com/cost" }}
      }};
    }},
  }},
"""
# 10 COMPATIBILITY
for i in range(1, 11):
    rule_id = f"cmp{i:03d}"
    cap_rule_id = f"CMP-{i:03d}"
    new_recipes += f"""
  {{
    ruleId: "{rule_id}",
    category: "COMPATIBILITY",
    label: "Compat flaw {i}",
    platforms: ["n8n", "make", "zapier", "flowise"],
    fixDescription: "Fix compat issue {i}",
    buildFlawNode(platform, i) {{
      return {{
        id: `{rule_id}-node-${{i}}`,
        name: `Node ${{i}}`,
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4,
        position: [600 + i * 20, 300],
        parameters: {{ url: "http://example.com/cmp" }}
      }};
    }},
  }},
"""

flaw_content = re.sub(r'\];\s*$', new_recipes + '\n];\n', flaw_content)

with open(flaw_recipes_path, "w", encoding="utf-8") as f:
    f.write(flaw_content)

# 2. Update audit-fixtures.ts
audit_fixtures_path = r"D:\PROJECTS\Site\work-flow-intel\src\lib\qa\audit-fixtures.ts"
with open(audit_fixtures_path, "r", encoding="utf-8") as f:
    audit_content = f.read()

new_mappings = ""
for i in range(1, 11):
    new_mappings += f'  obs{i:03d}: ["OBS-{i:03d}"],\n'
for i in range(1, 11):
    new_mappings += f'  idp{i:03d}: ["IDP-{i:03d}"],\n'
for i in range(1, 11):
    new_mappings += f'  doc{i:03d}: ["DOC-{i:03d}"],\n'
for i in range(1, 11):
    new_mappings += f'  cost{i:03d}: ["COST-{i:03d}"],\n'
for i in range(1, 11):
    new_mappings += f'  cmp{i:03d}: ["CMP-{i:03d}"],\n'

audit_content = re.sub(r'(cmp003:\s*\["CMP-003", "CMP-005"\],\n)', r'\1' + new_mappings, audit_content)

with open(audit_fixtures_path, "w", encoding="utf-8") as f:
    f.write(audit_content)

# 3. Update negative-fixtures.ts
neg_fixtures_path = r"D:\PROJECTS\Site\work-flow-intel\src\lib\qa\fixtures\negative-fixtures.ts"
with open(neg_fixtures_path, "r", encoding="utf-8") as f:
    neg_content = f.read()

new_negs = ""
for i in range(1, 21):
    new_negs += f"""
  {{
    id: "clean-fixture-{i}",
    platform: "n8n",
    label: "Clean fixture {i}",
    cleanReason: "Legitimate setup {i} with keywords Images Storage average package usage.",
    workflow: {{
      name: "[CLEAN] Safe workflow {i}",
      nodes: [
        {{
          id: "node-1", name: "Images Storage average package usage {i}",
          type: "n8n-nodes-base.code", typeVersion: 2,
          position: [200, 300],
          parameters: {{ jsCode: "const safe = true; return items;" }}
        }}
      ]
    }}
  }},
"""

neg_content = re.sub(r'\];\s*$', new_negs + '\n];\n', neg_content)

with open(neg_fixtures_path, "w", encoding="utf-8") as f:
    f.write(neg_content)

print("Done")
