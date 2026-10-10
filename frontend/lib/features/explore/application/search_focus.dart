import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Lets the Home search icon ask the Explore tab to focus its search field.
///
/// It is a pending flag rather than an event, so the request is not lost when
/// the Explore tab has not been built yet; Explore consumes it on arrival.
class SearchFocusRequest extends Notifier<bool> {
  @override
  bool build() => false;

  void request() => state = true;

  void consume() => state = false;
}

final searchFocusRequestProvider = NotifierProvider<SearchFocusRequest, bool>(
  SearchFocusRequest.new,
);
