"""Pluggable import adapters. Each parser turns a source file/payload into a ParseResult.

To add a new broker/source: implement a function returning ``ParseResult`` and register it
in ``registry.py``. The rest of the pipeline (reconcile → classify → store) is source-agnostic.
"""
