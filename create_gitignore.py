from pathlib import Path

gitignore_content = """# ==========================================
# ASP.NET Core / Visual Studio .gitignore
# ==========================================

# Build output
bin/
obj/

# Visual Studio
.vs/
*.user
*.suo
*.userosscache
*.sln.docstates

# Logs
*.log
*.err.log
*.out.log

# Temporary files
*.cache
*.tmp
*.temp

# IDE settings
.vscode/
.idea/

# Publish output
publish/

# Windows system files
Thumbs.db
Desktop.ini
"""

gitignore_path = Path(".gitignore")

# Overwrite or create the .gitignore file
gitignore_path.write_text(gitignore_content, encoding="utf-8")

print(f"✅ .gitignore created successfully at: {gitignore_path.resolve()}")