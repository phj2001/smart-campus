/**
 * Dijkstra 路径搜索算法
 */

import { Graph, GraphNode, findNearestNode, haversineDistance } from './roadNetwork';

export interface PathResult {
    path: [number, number][]; // 坐标路径 [lng, lat][]
    distance: number;        // 总距离（米）
    nodeIds: string[];       // 节点ID路径
}

/**
 * Dijkstra 最短路径算法
 */
export function dijkstra(
    graph: Graph,
    startId: string,
    endId: string
): PathResult | null {
    // 验证起点和终点存在
    if (!graph.has(startId) || !graph.has(endId)) {
        return null;
    }

    // 距离表
    const distances = new Map<string, number>();
    // 前驱节点表（用于重建路径）
    const previous = new Map<string, string | null>();
    // 未访问节点集合
    const unvisited = new Set<string>();

    // 初始化
    for (const nodeId of graph.keys()) {
        distances.set(nodeId, Infinity);
        previous.set(nodeId, null);
        unvisited.add(nodeId);
    }
    distances.set(startId, 0);

    while (unvisited.size > 0) {
        // 找到距离最小的未访问节点
        let current: string | null = null;
        let minDist = Infinity;

        for (const nodeId of unvisited) {
            const dist = distances.get(nodeId) ?? Infinity;
            if (dist < minDist) {
                minDist = dist;
                current = nodeId;
            }
        }

        // 如果没有可达节点，退出
        if (current === null || minDist === Infinity) {
            break;
        }

        // 如果到达终点，退出
        if (current === endId) {
            break;
        }

        // 移出未访问集合
        unvisited.delete(current);

        // 更新相邻节点距离
        const nodeData = graph.get(current);
        if (nodeData) {
            for (const edge of nodeData.edges) {
                if (unvisited.has(edge.to)) {
                    const newDist = (distances.get(current) ?? Infinity) + edge.distance;
                    if (newDist < (distances.get(edge.to) ?? Infinity)) {
                        distances.set(edge.to, newDist);
                        previous.set(edge.to, current);
                    }
                }
            }
        }
    }

    // 检查是否找到路径
    if (previous.get(endId) === null && startId !== endId) {
        return null;
    }

    // 重建路径
    const nodeIds: string[] = [];
    let current: string | null = endId;

    while (current !== null) {
        nodeIds.unshift(current);
        current = previous.get(current) ?? null;
    }

    // 转换为坐标数组
    const path: [number, number][] = nodeIds.map(id => {
        const nodeData = graph.get(id);
        return nodeData ? nodeData.node.coords : [0, 0];
    });

    return {
        path,
        distance: distances.get(endId) ?? 0,
        nodeIds
    };
}

/**
 * 从用户点击坐标规划路径
 * 自动吸附到最近的道路节点
 */
export function planRoute(
    graph: Graph,
    startCoords: [number, number],
    endCoords: [number, number]
): PathResult | null {
    const startNode = findNearestNode(graph, startCoords[0], startCoords[1]);
    const endNode = findNearestNode(graph, endCoords[0], endCoords[1]);

    if (!startNode || !endNode) {
        return null;
    }

    return dijkstra(graph, startNode.id, endNode.id);
}
