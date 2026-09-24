# 离线生成两炮三维磁力线

此目录只处理已授权的 21066 / 21138 私有 IMAS H5，不连接数据库、不自动发布。
科学范围与限制见 ../../docs/EFIT_FIELDLINES.md。审计报告和原始 H5 必须在仓库外保存。

在独立 Python 环境安装 requirements.txt 后，以真实路径替换下面的参数：

```powershell
py -3 -m pip install -r scripts/efit-fieldlines/requirements.txt
py -3 scripts/efit-fieldlines/test_core_fieldlines.py
py -3 scripts/efit-fieldlines/audit_imas_fields.py --source 21066=D:/private/21066/equilibrium.h5 --source 21138=D:/private/21138/equilibrium.h5 --output D:/private/fieldline-audit.json
py -3 scripts/efit-fieldlines/generate_fieldline_assets.py --source 21066=D:/private/21066/equilibrium.h5 --source 21138=D:/private/21138/equilibrium.h5 --audit D:/private/fieldline-audit.json --output D:/private/fieldline-candidate --workers 6
py -3 scripts/efit-fieldlines/verify_fieldline_assets.py D:/private/fieldline-candidate D:/private/fieldline-audit.json
npm run test:efit-fieldlines
```

生成目录必须为空；已有结果不会覆盖。可以先增加 `--pilot` 在独立目录试算首帧、400 ms 附近帧和末帧；
pilot 不能作为完整两炮发布。全量输出逐帧保留源索引，不补造缺帧，失败帧明确记录原因。
公开前审核候选文件只含线坐标/轮廓、无内网路径或原始网格，再将候选放入 public/data/exl50u-fieldlines-v1。
修改算法或导出器必须重新生成并审查数据，不应只手改索引内的代码摘要。
