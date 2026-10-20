#!/usr/bin/env bash
#
# cloudosp 验证版安装脚本（幂等，可重复执行）
#
# 用法：
#   cd /path/to/frappe-bench
#   ./apps/cloudosp/deploy/install.sh --site <站点名>
#
# 常用选项：
#   --site <名称>        必填，目标站点
#   --new-site           站点不存在时自动创建（会一并安装 erpnext）
#   --admin-password <pw> 建站时设置 Administrator 密码
#   --skip-build         跳过 bench build（已有资源时使用）
#   --bench-dir <路径>   显式指定 bench 目录（默认按脚本位置推断）
#   -h | --help          查看帮助
#
# 说明：
#   - 依赖 frappe v15 + erpnext v15（Customer / Asset / Item / Company / Account / Location 来自 ERPNext）
#   - 应用通过 fixtures 自带示例数据（规格字典 / 数据中心 / 网络分区 / 区域 / 资源池 / 产品 / 产品库存），
#     migrate 后自动导入，无需数据迁移
#   - fixtures 是覆盖式同步：如需修改示例数据，请改 fixtures/*.json 后执行 bench export-fixtures
#
set -euo pipefail

APP="cloudosp"
REQUIRED_APP="erpnext"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_BENCH_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BENCH_DIR="$DEFAULT_BENCH_DIR"

SITE=""
DO_NEW_SITE=0
SKIP_BUILD=0
ADMIN_PASSWORD=""

log() { printf '\033[36m[%s]\033[0m %s\n' "install" "$*"; }
warn() { printf '\033[33m[%s]\033[0m %s\n' " warn " "$*" >&2; }
die() { printf '\033[31m[%s]\033[0m %s\n' " error" "$*" >&2; exit 1; }

usage() {
	sed -n '3,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
	exit 0
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--site) SITE="${2:-}"; shift 2 ;;
		--new-site) DO_NEW_SITE=1; shift ;;
		--admin-password) ADMIN_PASSWORD="${2:-}"; shift 2 ;;
		--skip-build) SKIP_BUILD=1; shift ;;
		--bench-dir) BENCH_DIR="${2:-}"; shift 2 ;;
		-h|--help) usage ;;
		*) die "未知参数：$1（用 --help 查看用法）" ;;
	esac
done

[[ -n "$SITE" ]] || die "缺少 --site 参数，例如：./install.sh --site v.example.com"

# ---------------------------------------------------------------- 环境检查
command -v bench >/dev/null 2>&1 || die "未找到 bench 命令，请先在 bench 虚拟环境中执行（pipx/pipenv 激活后重试）"

[[ -d "$BENCH_DIR" ]] || die "bench 目录不存在：$BENCH_DIR"
cd "$BENCH_DIR"
[[ -d "sites" ]] || die "$BENCH_DIR 看起来不是 bench 目录（缺少 sites/）"

log "bench 目录：$BENCH_DIR"
log "目标站点 ：$SITE"

site_exists() { [[ -d "sites/$SITE" ]]; }

installed_apps() {
	# 返回该站点已安装的应用列表，形如 ["frappe","cloudosp","erpnext"]
	bench --site "$SITE" execute frappe.get_installed_apps 2>/dev/null | tr -d '\r' || true
}

has_app() {
	local app="$1"
	installed_apps | grep -q "\"$app\""
}

# ---------------------------------------------------------------- 1. 站点
if site_exists; then
	log "站点已存在，跳过创建"
else
	if [[ "$DO_NEW_SITE" -eq 1 ]]; then
		log "创建新站点并安装 $REQUIRED_APP ..."
		if [[ -n "$ADMIN_PASSWORD" ]]; then
			bench new-site "$SITE" --admin-password "$ADMIN_PASSWORD" --install-app "$REQUIRED_APP"
		else
			bench new-site "$SITE" --install-app "$REQUIRED_APP"
		fi
		log "站点创建完成"
	else
		die "站点 $SITE 不存在。加 --new-site 自动创建，或先手动执行：bench new-site $SITE --install-app $REQUIRED_APP"
	fi
fi

# ---------------------------------------------------------------- 2. 依赖应用
if has_app "$REQUIRED_APP"; then
	log "$REQUIRED_APP 已安装"
else
	die "$REQUIRED_APP 未安装在站点 $SITE。请先执行：bench --site $SITE install-app $REQUIRED_APP"
fi

# ---------------------------------------------------------------- 3. 安装应用
if has_app "$APP"; then
	log "$APP 已安装，跳过 install-app"
else
	log "安装 $APP ..."
	bench --site "$SITE" install-app "$APP"
	log "$APP 安装完成（fixtures 将在 migrate 阶段导入）"
fi

# ---------------------------------------------------------------- 4. 迁移（含 fixtures）
log "执行 migrate（同步 DocType、页面并导入 fixtures）..."
bench --site "$SITE" migrate

# ---------------------------------------------------------------- 5. 静态资源
if [[ "$SKIP_BUILD" -eq 1 ]]; then
	warn "已跳过 bench build（--skip-build）"
else
	log "构建静态资源..."
	bench build --app "$APP"
fi

# ---------------------------------------------------------------- 6. 清理缓存
log "清理缓存..."
bench --site "$SITE" clear-cache || true

# ---------------------------------------------------------------- 结果校验
log "校验安装结果..."
SUMMARY=$(bench --site "$SITE" execute "cloudosp.lease_asset.deploy_check.summary" 2>/dev/null || true)

if [[ -n "$SUMMARY" ]]; then
	# bench execute 返回的是 JSON 字符串，去掉外层引号并还原换行
	SUMMARY="${SUMMARY#\"}"
	SUMMARY="${SUMMARY%\"}"
	printf '%b\n' "$SUMMARY"
else
	warn "未找到 deploy_check.summary（可选自检脚本），跳过结果校验"
fi

cat <<EOF

------------------------------------------------------------------------------
安装完成：$APP @ $SITE

下一步：
  1) 启动/重启服务：  bench restart   （开发环境：bench start）
  2) 给验证账号赋权： 该站点 → User → 角色加 "System Manager"
     （多数页面 roles=System Manager；Lease Plan Order 已开放 Desk User）
  3) 访问：
     - Desk 工作台：        /app/lease-asset
     - 资产租赁仪表盘：      /app/lease-asset-dashboard
     - 运营服务仪表盘：      /app/ops-dashboard
     - 计划与预定：          /app/lease-plan-board
     - 产品库维护：          /app/product-catalog-admin
     - 资源池维护：          /app/resource-pool-admin
     - 扩容物控：            /app/expansion-control
     - 资产扩容接收：        /app/asset-receipt
     - 租赁申请处理：        /app/lease-request-process
     - 官网产品/下单页：     /lease_asset_portal（需登录）
------------------------------------------------------------------------------
EOF
