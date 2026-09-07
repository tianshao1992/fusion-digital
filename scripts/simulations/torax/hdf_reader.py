"""Read-only numeric HDF adapter: h5py on Linux, installed HDF5 C library on Windows.

The Windows fallback uses existing FUSE/Julia libraries; it installs no packages.
"""
import ctypes
import math
import os
from pathlib import Path


class HdfReader:
    def __init__(self, path):
        try:
            import h5py
        except ImportError:
            h5py = None
        self.file = h5py.File(path, 'r') if h5py else None
        if self.file is not None:
            return
        if os.name != 'nt':
            raise RuntimeError('Install h5py or use the existing TORAX venv')
        ctypes.windll.kernel32.SetErrorMode(3)
        root = Path(os.environ.get('FUSE_WORKSPACE', 'D:/Code/Fuse'))
        artifacts = root / '.julia-depot/artifacts'
        libraries = list(artifacts.glob('*/bin/libhdf5.dll'))
        if len(libraries) != 1:
            raise RuntimeError('Expected one installed HDF5 library')
        directories = list(artifacts.glob('*/bin')) + list((root / '.tools').glob('julia-*/bin')) + list((root / '.tools').glob('julia-*/lib/julia'))
        self.handles = [os.add_dll_directory(str(p)) for p in directories]
        self.lib = ctypes.CDLL(str(libraries[0]))
        assert self.lib.H5open() >= 0
        hid = ctypes.c_longlong
        signatures = {
            'H5Fopen': ([ctypes.c_char_p, ctypes.c_uint, hid], hid),
            'H5Dopen2': ([hid, ctypes.c_char_p, hid], hid),
            'H5Dget_space': ([hid], hid),
            'H5Sget_simple_extent_ndims': ([hid], ctypes.c_int),
            'H5Sget_simple_extent_dims': ([hid, ctypes.POINTER(ctypes.c_ulonglong), ctypes.POINTER(ctypes.c_ulonglong)], ctypes.c_int),
            'H5Dread': ([hid, hid, hid, hid, hid, ctypes.c_void_p], ctypes.c_int),
            'H5Lexists': ([hid, ctypes.c_char_p, hid], ctypes.c_int),
            'H5Dclose': ([hid], ctypes.c_int), 'H5Sclose': ([hid], ctypes.c_int), 'H5Fclose': ([hid], ctypes.c_int),
        }
        for name, (arguments, result) in signatures.items():
            fn = getattr(self.lib, name); fn.argtypes = arguments; fn.restype = result
        self.id = self.lib.H5Fopen(str(path).encode(), 0, 0)
        if self.id < 0:
            raise RuntimeError('HDF_OPEN_FAILED')

    def has(self, name):
        return name in self.file if self.file is not None else self.lib.H5Lexists(self.id, name.encode(), 0) > 0

    def numeric(self, name):
        if self.file is not None:
            value = self.file[name][...]
            return list(value.shape), value.reshape(-1).astype(float).tolist()
        dataset = self.lib.H5Dopen2(self.id, name.encode(), 0)
        if dataset < 0:
            raise RuntimeError('HDF_DATASET_NOT_FOUND: ' + name)
        space = self.lib.H5Dget_space(dataset)
        try:
            rank = self.lib.H5Sget_simple_extent_ndims(space)
            dimensions = (ctypes.c_ulonglong * rank)()
            self.lib.H5Sget_simple_extent_dims(space, dimensions, None)
            shape = list(dimensions); size = math.prod(shape)
            if size > 2_000_000:
                raise RuntimeError('DATASET_TOO_LARGE')
            values = (ctypes.c_double * size)()
            native_double = ctypes.c_longlong.in_dll(self.lib, 'H5T_NATIVE_DOUBLE_g').value
            if self.lib.H5Dread(dataset, native_double, 0, 0, 0, values) < 0:
                raise RuntimeError('HDF_READ_FAILED')
            return shape, list(values)
        finally:
            self.lib.H5Sclose(space); self.lib.H5Dclose(dataset)

    def close(self):
        if self.file is not None:
            self.file.close()
        else:
            self.lib.H5Fclose(self.id)
            for handle in self.handles:
                handle.close()
