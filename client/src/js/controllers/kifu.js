/*jshint browser:true, maxparams: 10000000 */
/*global WGo:true*/

angular.module('gokibitz.controllers')
.controller('KifuController', function (
	$rootScope,
	$scope,
	$http,
	$timeout,
	$routeParams,
	$location,
	pathFilter,
	LoginSignup,
	kifu,
	$interpolate,
	$document,
	$modal,
	hotkeys
) {
	var smartgame = require('smartgame');
	var smartgamer = require('smartgamer');
	var _ = require('lodash');

	// Make the login/signup modal avaialble
	$scope.LoginSignup = LoginSignup;

	var comments = require('../helpers/comments.js');

	$scope.sgfLink = '/api/kifu/' + $routeParams.shortid + '/sgf';

	$scope.kifu = kifu.data;

	hotkeys.bindTo($scope)
		.add({
			combo: 'left',
			description: 'Go to the previous move',
			callback: function (event, hotkey) {
				$scope.player.previous();
				event.preventDefault();
			}
		})
		.add({
			combo: 'right',
			description: 'Go to the next move',
			callback: function (event, hotkey) {
				$scope.player.next();
				event.preventDefault();
			}
		});

	// Check if the current path is in a variation, or on the primary tree
	function inVariation(path) {
		for (var variation in path) {
			if (variation !== 'm' && path[variation] !== 0) {
				// path is in a variation
				return true;
			}
		}
		// path is on the primary tree
		return false;
	}

	// Get the initial path from the URL
	var initialPath = $location.search().path;
	initialPath = pathFilter(initialPath, 'object');
	$scope.kifu.path = initialPath;

	// Fired every time the player updates
	$scope.playerUpdate = function (event) {
		if (event.op === 'init') {
			return;
		}

		// In theory, this means it's the last move
		// (In theory, Communism works! IN THEORY.)
		if (!inVariation(event.path) && !event.node.children.length) {
			$scope.lastMove = true;
		} else {
			$scope.lastMove = false;
		}

		// Make sure this happens in the next digest cycle
		$timeout(function () {
			var move;

			if (!$scope.editMode && !$scope.variationMode) {

				$scope.kifu.path = event.path;
				$scope.captures = event.position.capCount;

				move = $scope.kifu.path.m;

				if (move > 0) {
					// Put the move in the query string for super sweet permalinks
					$location.search('path', pathFilter($scope.kifu.path, 'string'));
				} else {
					// For move zero, no permalink needed
					$location.search('path', null);
				}
			}

			// Format game comments
			$scope.nodeComment = event.node.comment;
			$scope.sgfComment = comments.format(event.node.comment);

			// ...
			if ($scope.uniqComments && $scope.uniqComments.length) {
				var firstUniq = $scope.uniqComments[0];
				var lastUniq = $scope.uniqComments[$scope.uniqComments.length - 1];

				console.log('$scope.uniqComments', $scope.uniqComments);
				console.log('$scope.kifu.path, firstUniq, lastUniq', $scope.kifu.path, firstUniq, lastUniq);

				console.log('$scope.comparePaths($scope.kifu.path, firstUniq)', $scope.comparePaths($scope.kifu.path, firstUniq));
				console.log('$scope.comparePaths($scope.kifu.path, lastUniq)', $scope.comparePaths($scope.kifu.path, lastUniq));
				if ($scope.comparePaths($scope.kifu.path, firstUniq) > 0) {
					$scope.moreCommentsBefore = true;
				} else {
					$scope.moreCommentsBefore = false;
				}

				if ($scope.comparePaths($scope.kifu.path, lastUniq) < 0) {
					$scope.moreCommentsAfter = true;
				} else {
					$scope.moreCommentsAfter = false;
				}

			} else {
				$scope.moreCommentsBefore = false;
				$scope.moreCommentsAfter = false;
			}

			console.log('$scope.moreCommentsBefore, $scope.moreCommentsAfter', $scope.moreCommentsBefore, $scope.moreCommentsAfter);
		});
	};

	$scope.toggleKifuVarMode = function () {
		$scope.variationMode = !$scope.variationMode;
		$scope.toggleEditMode();
	};

	// Set the page title
	var titleTemplate = $interpolate(
		'{{ white.name || "Anonymous" }} {{ white.rank }} vs. {{ black.name || "Anonymous" }} {{ black.rank }} – GoKibitz'
	);
	$scope.$watch('info', function () {
		if ($scope.info) {
			var pageTitle = titleTemplate($scope.info);
			$rootScope.pageTitle = pageTitle;
		}
	});

	// Edit mode lets owners actually edit their SGFs by interacting with the board
	// TODO: Complete this implementation
	$scope.toggleEditMode = function () {
		var newMode;

		$scope._editable = $scope._editable || new WGo.Player.Editable($scope.player, $scope.player.board);
		newMode = !$scope._editable.editMode;
		$scope._editable.set(newMode, false);
		$scope.editMode = newMode;
	};

	// Let touchscreen users swipe left and right to navigate
	$scope.swipeLeft = function (event) {
		$scope.player.next();
	};

	$scope.swipeRight = function (event) {
		$scope.player.previous();
	};

	$scope.comparePaths = function(a, b){
		var getKeys = function(obj){
			var keys = Object.keys(obj).filter(function(key) {
				return !isNaN(parseInt(key));
			});
			keys.sort(function(a, b) {
				return Number(a) - Number(b);
			});

			while (obj[keys[0]] == 0){
				keys.shift();
			}
			return keys;
		};

		var aKeys = getKeys(a);
		var bKeys = getKeys(b);

		function compareKeys(aKeys, bKeys) {
			var aKey = (aKeys.length) ? aKeys[0] : 0;
			var bKey = (bKeys.length) ? bKeys[0] : 0;

			// If the lowest keys are different, use them to sort
			if (aKey !== bKey) {
				return aKey - bKey;
			} else {
				// If the VALUES of the lowest keys are different,
				// use them to sort
				if (a[aKey] !== b[bKey]) {
					return a[aKey] - b[bKey];
				} else {
					// Otherwise, drop the lowest key values
					aKeys.shift();
					bKeys.shift();

					if(aKeys.length === 0 && bKeys.length === 0){
						//These are on the same branch. Check to see which move is higher.
						return a.m - b.m;
					} else {
						// else try to see where the differ further
						return compareKeys(aKeys, bKeys);
					}
				}
			}
		}
		return compareKeys(aKeys, bKeys);
	 };

	$scope.updateUniqComments = function() {
		var paths = [];

		$http.get('api/kifu/' + $scope.kifu.shortid)
			.success(function(data) {
				var comments = data.comments;

				if (comments) {
					comments.forEach(function (comment) {
						paths.push(comment.path);
					});
				}
				// Remove duplicates
				paths = _.uniq(paths);

				// Turn paths into objects
				// (This can't be used with map on its own, because pathTransform accepts optional arguments)
				// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map#Example:_Tricky_use_case
				paths = paths.map(function (path) {
					return smartgamer().pathTransform(path, 'object');
				});
				paths.sort($scope.comparePaths);
				$scope.uniqComments = paths;
			}).error(function(data, status, headers, config){
				console.log("Error retrieving kifu for new comments: ", data.message);
			});
	};

	$scope.updateUniqComments($scope.kifu.comments);

	$scope.previousCommentedMove = function () {
		var i = $scope.uniqComments.length - 1;
		while (i >= 0) {
			if ($scope.comparePaths($scope.kifu.path, $scope.uniqComments[i]) > 0) {
				$scope.player.goTo($scope.uniqComments[i]);
				return;
			}
			i -= 1;
		}
	};

	$scope.nextCommentedMove = function () {
		var i = 0;
		while (i < $scope.uniqComments.length) {
			if ($scope.comparePaths($scope.kifu.path, $scope.uniqComments[i]) < 0) {
				$scope.player.goTo($scope.uniqComments[i]);
				console.log('i, $scope.uniqComments.length', i, $scope.uniqComments.length);
				var lastUniq = $scope.uniqComments[$scope.uniqComments.length - 1];
				console.log('$scope.kifu.path, lastUniq', $scope.kifu.path, lastUniq);
				return;
			}
			i += 1;
		}
	};

	hotkeys.bindTo($scope)
		.add({
			combo: 'alt+left',
			description: 'Go to the previous move with comments',
			callback: function (event, hotkey) {
				$scope.previousCommentedMove();
				event.preventDefault();
			}
		})
		.add({
			combo: 'alt+right',
			description: 'Go to the next move with comments',
			callback: function (event, hotkey) {
				$scope.nextCommentedMove();
				event.preventDefault();
			}
		});

	$scope.moreCommentsAfter = function () {
		if (!$scope.uniqComments || $scope.uniqComments.length) {
			return;
		}

		var lastUniq = $scope.uniqComments[$scope.uniqComments.length - 1];
		console.log('$scope.kifu.path, lastUniq', $scope.kifu.path, lastUniq);
		console.log('compare', $scope.comparePaths($scope.kifu.path, lastUniq));
		if ($scope.comparePaths($scope.kifu.path, lastUniq) > -1) {
			return false;
		} else {
			return true;
		}
	};

	$scope.moreCommentsBefore = function () {
	};

	// TODO: Use this method of getting the edited version of the SGF and doing
	// something useful with it (like save it)
	$scope.getSgf = function () {
		console.log($scope.player.kifuReader.kifu.toSgf());
	};


	// When the path in the query string changes, go to that move
	$scope.$on('$routeUpdate', function () {
		var path = $location.search().path;
		var newPath = pathFilter(path);

		if (!angular.equals(newPath, $scope.kifu.path)) {
			$scope.player.goTo(newPath);
		}
	});

	// Open a modal with embed code
	$scope.embed = function (id) {
		$modal.open({
			templateUrl: '/partials/embed',
			controller: 'EmbedController',
			resolve: {
				id: function () {
					return $routeParams.shortid;
				}
			}
		});
	};

	$scope.editGameComment = false;

	$scope.toggleEditGameComment = function () {
		$scope.editGameComment = !$scope.editGameComment;

		if ($scope.editGameComment) {
			$scope.originalNodeComment = $scope.nodeComment;
		}
	};

	$scope.cancelGameComment = function () {
		$scope.nodeComment = $scope.originalNodeComment;
		$scope.editGameComment = false;
	};

	$scope.saveGameComment = function () {
		$scope.savingGameComment = true;

		var gamer = smartgamer(smartgame.parse($scope.kifu.game.sgf));
		gamer.goTo($scope.kifu.path);
		gamer.comment($scope.nodeComment.replace(/([^\\])(\])/g, '$1\\$2'));
		var sgf = smartgame.generate(gamer.getSmartgame());
		$http.put('/api/kifu/' + $scope.kifu._id + '/sgf', {
			sgf: sgf
		})
			.success(function () {
				$scope.savingGameComment = false;
				$scope.editGameComment = false;
				$scope.sgfComment = comments.format($scope.nodeComment);
				$scope.player.kifuReader.node.comment = $scope.nodeComment;

			})
			.error(function () {
				console.log('error', arguments);
				$scope.savingGameComment = false;
			});
	};

});
