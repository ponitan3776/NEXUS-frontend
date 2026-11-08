@echo off
rem surge.sh にフロントエンド(frontend\)を公開します(Windows 用)
rem   公開先: https://nexus-vortx.surge.sh （固定）
rem   使い方:   deploy-surge.bat
setlocal
cd /d "%~dp0"
set "DOMAIN=nexus-vortx.surge.sh"
if not exist "frontend\index.html" (
  echo frontend\index.html が見つかりません。リポジトリの一番上のフォルダで実行してください。
  exit /b 1
)
if exist ".surge-dist" rmdir /s /q ".surge-dist"
mkdir ".surge-dist"
xcopy "frontend" ".surge-dist" /e /i /q /y >nul
if exist ".surge-dist\CNAME" del /q ".surge-dist\CNAME"
> ".surge-dist\CNAME" echo %DOMAIN%
copy /y ".surge-dist\index.html" ".surge-dist\200.html" >nul
copy /y ".surge-dist\index.html" ".surge-dist\404.html" >nul
echo 公開先: https://%DOMAIN%
if "%DRY_RUN%"=="1" (
  echo DRY_RUN=1 なので、アップはしません。中身は .surge-dist\ を見てください。
  exit /b 0
)
call npx --yes surge ".surge-dist" %DOMAIN%
if errorlevel 1 exit /b 1
echo 公開しました: https://%DOMAIN%
echo バックエンド(Render)の環境変数 ALLOWED_ORIGINS に https://%DOMAIN% を入れてください(未設定なら不要)
