"""
TDA Mapper integration using tda-mapper library.
Builds a topological graph from hand landmark history.
"""
import numpy as np
import logging

logger = logging.getLogger(__name__)


def build_mapper_graph(landmark_history: list[list[float]], n_cubes: int = 10, overlap: float = 0.3) -> dict:
    """
    Build a TDA Mapper graph from hand landmark history.
    Uses CubicalCover with PCA lens for 1D projection.
    """
    if len(landmark_history) < 10:
        return {"nodes": [], "edges": [], "message": "Not enough data yet (need at least 10 frames)"}

    try:
        from tdamapper.cover import CubicalCover
        from tdamapper.clustering import TrivialClustering
        from tdamapper.core import mapper_graph
        from sklearn.decomposition import PCA

        data = np.array(landmark_history, dtype=np.float32)

        # Project to 1D via PCA as the lens function
        pca = PCA(n_components=1)
        lens = pca.fit_transform(data).flatten()  # shape (n,)
        lens_min, lens_max = float(lens.min()), float(lens.max())

        # Build mapper graph
        cover = CubicalCover(n_intervals=n_cubes, overlap_frac=overlap)
        clustering = TrivialClustering()
        graph = mapper_graph(data=data, lens=lens, cover=cover, clustering=clustering)

        nodes = []
        edges = []

        for node_id, node_data in graph.nodes(data=True):
            size = node_data.get("size", 1)
            indices = list(node_data.get("indices", []))
            color_val = float(np.mean(lens[indices])) if indices else 0.0
            normalized = (color_val - lens_min) / (lens_max - lens_min + 1e-8)
            color = _value_to_color(normalized)
            nodes.append({
                "id": str(node_id),
                "size": int(size),
                "color": color,
                "label": f"G{node_id}",
            })

        for src, tgt, edge_data in graph.edges(data=True):
            edges.append({
                "source": str(src),
                "target": str(tgt),
                "weight": float(edge_data.get("weight", 1.0)),
            })

        logger.info("Mapper graph: %d nodes, %d edges from %d frames", len(nodes), len(edges), len(data))
        return {"nodes": nodes, "edges": edges}

    except Exception as e:
        logger.warning("Mapper analysis error: %s — using KMeans fallback", e)
        return _kmeans_graph(landmark_history)


def _value_to_color(t: float) -> str:
    """Map 0-1 → pink-to-purple hex color (Gumroad palette)."""
    t = max(0.0, min(1.0, t))
    r = int(255 * (1 - t) + 98 * t)
    g = int(144 * (1 - t) + 91 * t)
    b = int(232 * (1 - t) + 246 * t)
    return f"#{r:02x}{g:02x}{b:02x}"


def _kmeans_graph(landmark_history: list[list[float]]) -> dict:
    """Fallback graph using KMeans clustering."""
    from sklearn.cluster import KMeans

    data = np.array(landmark_history, dtype=np.float32)
    n_clusters = min(6, len(data))
    km = KMeans(n_clusters=n_clusters, n_init=5, random_state=42)
    labels = km.fit_predict(data)

    nodes = [
        {
            "id": str(i),
            "size": int(np.sum(labels == i)),
            "color": _value_to_color(i / max(1, n_clusters - 1)),
            "label": f"G{i}",
        }
        for i in range(n_clusters)
    ]
    edges = [
        {"source": str(i), "target": str(i + 1), "weight": 1.0}
        for i in range(n_clusters - 1)
    ]
    return {"nodes": nodes, "edges": edges}
