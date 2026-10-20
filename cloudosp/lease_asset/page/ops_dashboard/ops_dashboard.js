frappe.pages["ops-dashboard"].on_page_load = function (wrapper) {
	const API = "cloudosp.lease_asset.ops_api";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("运营服务仪表盘"),
		single_column: true,
	});

	$(`<style>
		.ops-panel { background: var(--fg-color); border-radius: var(--border-radius-md); padding: 16px; }
		.ops-title { margin: 0 0 10px; font-weight: 600; }
		.ops-stats { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
		.ops-stat { flex: 1 1 130px; min-width: 120px; border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md); padding: 10px 12px; }
		.ops-stat-value { font-size: 19px; font-weight: 600; }
		.ops-stat-label { font-size: 12px; color: var(--text-muted); }
		.ops-tag { font-size: 11px; color: var(--text-muted); margin: 0 6px; }
		.ops-pager { display: flex; align-items: center; margin-top: 8px; }
		.ops-list th, .ops-list td { font-size: 12px; vertical-align: middle; }
		.ops-empty { color: var(--text-muted); font-size: 12px; }
		.ops-group { margin-bottom: 22px; }
	</style>`).appendTo(page.main);

	const $layout = $(`
		<div class="ops-panel">
			<ul class="nav nav-tabs ops-tabs">
				<li class="nav-item"><a class="nav-link active" href="#" data-tab="plan">${__("计划 / 预定")}</a></li>
				<li class="nav-item"><a class="nav-link" href="#" data-tab="sales">${__("销售订单")}</a></li>
				<li class="nav-item"><a class="nav-link" href="#" data-tab="replenish">${__("补货单")}</a></li>
				<li class="nav-item"><a class="nav-link" href="#" data-tab="capacity">${__("容量变化（按周 · 分区域）")}</a></li>
			</ul>
			<div class="ops-body mt-3"></div>
		</div>
	`).appendTo(page.main);

	const $body = $layout.find(".ops-body");
	const state = { tab: "plan", pages: { plan: 1, sales: 1, replenish: 1 }, data: {} };
	const api = (method, args) => frappe.xcall(`${API}.${method}`, args);
	const esc = (val) => frappe.utils.escape_html(val || "");
	const num = (val) => {
		const n = Number(val || 0);
		return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
	};

	const stat = (label, value) =>
		`<div class="ops-stat"><div class="ops-stat-value">${esc(value)}</div><div class="ops-stat-label">${esc(
			label
		)}</div></div>`;

	const stats_html = (stats, labels) => {
		let html = "";
		for (const key of Object.keys(labels)) {
			if (!(key in stats)) continue;
			html += stat(labels[key], stats[key]);
		}
		for (const key of Object.keys(stats)) {
			if (key.endsWith("_by") || !(key in labels) || typeof stats[key] !== "object") continue;
		}
		for (const key of Object.keys(stats)) {
			if (typeof stats[key] === "object" && stats[key] !== null) {
				for (const sub of Object.keys(stats[key])) {
					html += stat(`${labels.__group__ || ""}${sub}`, stats[key][sub]);
				}
			}
		}
		return `<div class="ops-stats">${html}</div>`;
	};

	const pager = (list, kind) => {
		if (!list || !list.total) return "";
		return `<div class="ops-pager">
			<button class="btn btn-xs btn-default ops-page" data-kind="${esc(kind)}" data-page="${Math.max(
			list.page - 1,
			1
		)}">${__("上一页")}</button>
			<span class="ops-tag">${esc(list.page)} / ${esc(list.pages)} · ${__("共")} ${esc(list.total)} ${__(
			"条"
		)}</span>
			<button class="btn btn-xs btn-default ops-page" data-kind="${esc(kind)}" data-page="${Math.min(
			list.page + 1,
			list.pages
		)}">${__("下一页")}</button>
		</div>`;
	};

	const table = (headers, rows, empty_text) => {
		if (!rows.length) return `<div class="ops-empty">${esc(empty_text)}</div>`;
		let html = `<table class="table table-sm table-bordered ops-list"><thead class="thead-light"><tr>`;
		headers.forEach((h) => (html += `<th>${esc(h)}</th>`));
		html += `</tr></thead><tbody>`;
		rows.forEach((row) => {
			html += `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
		});
		return html + `</tbody></table>`;
	};

	const render_plan = () => {
		const data = state.data.plan;
		if (!data) return;
		let html = "";
		["计划", "预定"].forEach((type) => {
			const group = data[type] || { stats: {}, list: { rows: [] } };
			html += `<div class="ops-group">
				<h6 class="ops-title">${esc(type)}${__("单")}</h6>
				${stats_html(group.stats, {
					total: __("单量"),
					cpu_total: __("CPU（核）"),
					memory_total: __("内存（GB）"),
					storage_total: __("存储（TB）"),
					__group__: __("状态") + "：",
				})}
				${table(
					[__("单号"), __("提交人"), __("客户"), __("期望日期"), __("状态"), __("CPU（核）"), __("内存（GB）"), __("存储（TB）"), __("条目数")],
					(group.list.rows || []).map((row) => [
						esc(row.name),
						esc(row.requested_by || ""),
						esc(row.customer_name || row.customer || ""),
						esc(row.expected_date || ""),
						esc(row.status || ""),
						esc(num(row.cpu_total)),
						esc(num(row.memory_total)),
						esc(num(row.storage_total)),
						esc(row.item_count),
					]),
					__("暂无") + type + __("单")
				)}
				${pager(group.list, "plan")}
			</div>`;
		});
		$body.html(html);
	};

	const render_sales = () => {
		const data = state.data.sales;
		if (!data) return;
		$body.html(`
			<h6 class="ops-title">${__("销售订单")}</h6>
			${stats_html(data.stats, {
				total: __("订单数"),
				customers: __("客户数"),
				amount: __("金额合计"),
				items: __("明细行数"),
				__group__: __("状态") + "：",
			})}
			${table(
				[__("单号"), __("客户"), __("订单日期"), __("状态"), __("明细数"), __("金额")],
				(data.list.rows || []).map((row) => [
					esc(row.name),
					esc(row.customer_name || row.customer || ""),
					esc(row.order_date || ""),
					esc(row.status || ""),
					esc(row.item_count),
					esc(num(row.total_amount)),
				]),
				__("暂无销售订单")
			)}
			${pager(data.list, "sales")}
		`);
	};

	const render_replenish = () => {
		const data = state.data.replenish;
		if (!data) return;
		$body.html(`
			<h6 class="ops-title">${__("补货单")}</h6>
			${stats_html(data.stats, {
				total: __("单数"),
				cpu_add: __("新增 CPU（核）"),
				memory_add: __("新增内存（GB）"),
				storage_add: __("新增存储（TB）"),
				machines: __("新增物理机（台）"),
				__group__: __("类型") + "：",
			})}
			${table(
				[__("单号"), __("类型"), __("资源池"), __("区域"), __("期望日期"), __("完成日期"), __("状态"), __("CPU"), __("内存"), __("存储"), __("台数")],
				(data.list.rows || []).map((row) => [
					esc(row.name),
					esc(row.replenish_type || ""),
					esc(row.pool_name || row.resource_pool || ""),
					esc(row.region_name || row.region || ""),
					esc(row.expected_date || ""),
					esc(row.actual_date || ""),
					esc(row.status || ""),
					esc(num(row.cpu_add)),
					esc(num(row.memory_add)),
					esc(num(row.storage_add)),
					esc(num(row.machine_count)),
				]),
				__("暂无补货单")
			)}
			${pager(data.list, "replenish")}
		`);
	};

	const render_capacity = () => {
		const data = state.data.capacity;
		if (!data) return;
		$body.html(`
			<h6 class="ops-title">${__("容量变化（按周 · 分区域）")}</h6>
			${stats_html(data.stats, {
				weeks: __("周数"),
				regions: __("区域数"),
				cpu_added: __("新增 CPU（核）"),
				cpu_consumed: __("消耗 CPU（核）"),
				machines_added: __("新增物理机（台）"),
			})}
			${table(
				[
					__("周"),
					__("区域"),
					__("新增 CPU"),
					__("新增内存"),
					__("新增存储"),
					__("新增台数"),
					__("消耗 CPU"),
					__("消耗内存"),
					__("消耗存储"),
					__("净变化 CPU"),
					__("净变化内存"),
					__("净变化存储"),
				],
				(data.rows || []).map((row) => [
					esc(row.week_label),
					esc(row.region_name || row.region || __("未指定区域")),
					esc(num(row.cpu_added)),
					esc(num(row.memory_added)),
					esc(num(row.storage_added)),
					esc(num(row.machines_added)),
					esc(num(row.cpu_consumed)),
					esc(num(row.memory_consumed)),
					esc(num(row.storage_consumed)),
					esc(num(row.cpu_net)),
					esc(num(row.memory_net)),
					esc(num(row.storage_net)),
				]),
				__("暂无容量变化记录")
			)}
		`);
	};

	const loaders = {
		plan: () => api("get_plan_board", { page: state.pages.plan, page_size: 20 }).then((res) => (state.data.plan = res)),
		sales: () => api("get_sales_board", { page: state.pages.sales, page_size: 20 }).then((res) => (state.data.sales = res)),
		replenish: () => api("get_replenish_board", { page: state.pages.replenish, page_size: 20 }).then((res) => (state.data.replenish = res)),
		capacity: () => api("get_capacity_weekly", { weeks: 8 }).then((res) => (state.data.capacity = res)),
	};

	const renderers = { plan: render_plan, sales: render_sales, replenish: render_replenish, capacity: render_capacity };

	const load_tab = () => {
		$body.html(`<div class="ops-empty">${__("加载中")}...</div>`);
		loaders[state.tab]()
			.then(() => renderers[state.tab]())
			.catch((err) => $body.html(`<div class="ops-empty">${esc(err || __("加载失败"))}</div>`));
	};

	$layout.find(".ops-tabs .nav-link").on("click", function (e) {
		e.preventDefault();
		state.tab = $(this).attr("data-tab");
		$layout.find(".ops-tabs .nav-link").removeClass("active");
		$(this).addClass("active");
		load_tab();
	});

	$body.on("click", ".ops-page", function () {
		const kind = $(this).attr("data-kind");
		state.pages[kind] = parseInt($(this).attr("data-page"), 10) || 1;
		loaders[kind]()
			.then(() => renderers[state.tab]())
			.catch((err) => frappe.msgprint(esc(err || __("加载失败"))));
	});

	page.set_primary_action(__("刷新"), load_tab);

	load_tab();
};
