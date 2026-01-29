param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

$dirty = git status --porcelain
if ($dirty) {
  Write-Error "Repositorio com modificacoes pendentes. Commit/stage antes de liberar.\n$dirty"
}

$currentVersion = node -p "require('./desktop/package.json').version"
try {
  $cur = [Version]$currentVersion
  $req = [Version]$Version
} catch {
  Write-Error "Versao invalida. Atual='$currentVersion' Solicitada='$Version'. Use formato X.Y.Z"
}

if ($req -le $cur) {
  Write-Error "Versao solicitada ($Version) deve ser maior que a atual ($currentVersion)."
}

Write-Host "Atualizando versao do desktop para $Version"

npm --prefix desktop version $Version --no-git-tag-version

# Garante que o lock foi atualizado
if (!(Test-Path "desktop/package-lock.json")) {
  Write-Error "desktop/package-lock.json nao encontrado apos bump de versao"
}

git add desktop/package.json desktop/package-lock.json

git commit -m "chore(desktop): bump versao para $Version"

git tag -a "v$Version" -m "Release $Version"

git push

git push origin "v$Version"

Write-Host "OK. Tag v$Version enviada. O GitHub Actions vai gerar o instalador e criar a Release."