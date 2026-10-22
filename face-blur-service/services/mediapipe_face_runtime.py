"""Load only MediaPipe's pinned face-detector runtime.

MediaPipe 0.10.35 eagerly imports audio, text, drawing, plotting and every
vision task from its public package initializers. The face worker runs on a
512 MB Render instance, so importing those unused modules can cause the OS to
terminate the killable child before it returns a result. The dependency is
version-pinned and this loader exposes only the official face-detector classes
used by CebSpot.
"""
from functools import lru_cache
from importlib import import_module, util
from importlib.machinery import ModuleSpec
from pathlib import Path
from types import ModuleType, SimpleNamespace
import sys


def _namespace(name: str, path: Path) -> None:
    if name in sys.modules:
        return
    module = ModuleType(name)
    module.__package__ = name
    module.__path__ = [str(path)]
    module.__spec__ = ModuleSpec(name, loader=None, is_package=True)
    module.__spec__.submodule_search_locations = module.__path__
    sys.modules[name] = module


@lru_cache(maxsize=1)
def load_face_runtime() -> SimpleNamespace:
    spec = util.find_spec('mediapipe')
    if spec is None or not spec.submodule_search_locations:
        raise RuntimeError('MediaPipe runtime is unavailable.')
    root = Path(next(iter(spec.submodule_search_locations))).resolve()

    packages = {
        'mediapipe': root,
        'mediapipe.tasks': root / 'tasks',
        'mediapipe.tasks.python': root / 'tasks' / 'python',
        'mediapipe.tasks.python.components': root / 'tasks' / 'python' / 'components',
        'mediapipe.tasks.python.components.containers': root / 'tasks' / 'python' / 'components' / 'containers',
        'mediapipe.tasks.python.core': root / 'tasks' / 'python' / 'core',
        'mediapipe.tasks.python.vision': root / 'tasks' / 'python' / 'vision',
        'mediapipe.tasks.python.vision.core': root / 'tasks' / 'python' / 'vision' / 'core',
    }
    for name, path in packages.items():
        if not path.is_dir():
            raise RuntimeError('Pinned MediaPipe package layout is unavailable.')
        _namespace(name, path)

    base_options = import_module('mediapipe.tasks.python.core.base_options')
    face_detector = import_module('mediapipe.tasks.python.vision.face_detector')
    image = import_module('mediapipe.tasks.python.vision.core.image')
    running_mode = import_module('mediapipe.tasks.python.vision.core.vision_task_running_mode')
    return SimpleNamespace(
        BaseOptions=base_options.BaseOptions,
        FaceDetector=face_detector.FaceDetector,
        FaceDetectorOptions=face_detector.FaceDetectorOptions,
        Image=image.Image,
        ImageFormat=image.ImageFormat,
        RunningMode=running_mode.VisionTaskRunningMode,
    )
